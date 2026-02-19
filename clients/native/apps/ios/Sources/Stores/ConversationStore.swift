import Foundation
import PiCore

@MainActor
@Observable
final class ConversationStore {
    // MARK: - Published state

    private(set) var items: [Client.ConversationItem] = []
    private(set) var connectionState: ConnectionState = .disconnected
    private(set) var isAgentRunning: Bool = false

    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case error(String)
    }

    // MARK: - Private state

    private var reducer = Client.EventReducer()
    private var webSocket: Relay.RelayWebSocket?
    private var eventTask: Task<Void, Never>?
    private var eventSeq: Int = 0

    // Throttle high-frequency streaming updates to reduce render churn.
    private var pendingMessageUpdates: [Relay.ServerEvent] = []
    private var messageUpdateFlushTask: Task<Void, Never>?
    private let messageUpdateFlushIntervalNs: UInt64 = 100_000_000

    private let client: Relay.RelayClient
    private let sessionId: String

    init(client: Relay.RelayClient, sessionId: String) {
        self.client = client
        self.sessionId = sessionId
    }

    // MARK: - Lifecycle

    /// Activate, replay relay events, then connect WebSocket for live events.
    ///
    /// This matches dashboard behavior and avoids depending on a single JSONL
    /// file when a relay session spans multiple agent runtimes.
    func connect() async {
        if connectionState == .connecting || connectionState == .connected { return }

        connectionState = .connecting

        // Get the persistent clientId from the relay client
        let clientId = await client.clientId
        let activatedLastSeq: Int

        // 1. Activate session (ensures sandbox is running) and get replay bound.
        do {
            let activation = try await client.activateSession(id: sessionId, clientId: clientId)
            activatedLastSeq = activation.lastSeq
        } catch {
            connectionState = .error(error.localizedDescription)
            return
        }

        // 2. Register client capabilities after activation
        do {
            try await client.setClientCapabilities(
                sessionId: sessionId,
                clientId: clientId,
                capabilities: Relay.ClientCapabilities(clientKind: .iOS, extensionUI: true)
            )
        } catch {
            // Log but don't fail - capabilities are optional for basic functionality
            print("Failed to set client capabilities: \(error)")
        }

        // 3. Reset local transcript state and replay journal events up to activate seq.
        items = []
        reducer = Client.EventReducer()
        eventSeq = 0

        do {
            try await replayJournalEvents(upTo: activatedLastSeq)
        } catch {
            // Fallback: best-effort history parse if events endpoint fails.
            do {
                let historyResponse = try await client.getSessionHistory(id: sessionId)
                items = Client.parseHistory(historyResponse.entries)
            } catch {
                items = []
            }
        }

        // 4. Connect WebSocket from the activate checkpoint.
        let baseURL = await client.baseURL
        let webSocketConnection = Relay.RelayWebSocket(
            sessionId: sessionId,
            clientId: clientId,
            baseURL: baseURL,
            lastSeq: activatedLastSeq
        )
        self.webSocket = webSocketConnection
        connectionState = .connected

        eventTask = Task { [weak self] in
            for await event in webSocketConnection.connect() {
                guard let self else { return }
                self.handleEvent(event)
            }
            self?.connectionState = .disconnected
        }
    }

    func disconnect() {
        eventTask?.cancel()
        eventTask = nil
        messageUpdateFlushTask?.cancel()
        messageUpdateFlushTask = nil
        pendingMessageUpdates.removeAll(keepingCapacity: false)
        Task { await webSocket?.disconnect() }
        webSocket = nil
        connectionState = .disconnected
    }

    // MARK: - User actions

    func sendPrompt(_ text: String) async {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        // Optimistically add user message
        let userItem = Client.UserMessageItem(
            id: "user-\(eventSeq)",
            text: text,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            sendStatus: .sending
        )
        items.append(.user(userItem))
        eventSeq += 1

        // Send via WebSocket
        do {
            try await webSocket?.send(.prompt(message: text))
            // Mark as sent
            if let idx = items.lastIndex(where: { $0.id == userItem.id }) {
                if case .user(var item) = items[idx] {
                    item.sendStatus = .sent
                    items[idx] = .user(item)
                }
            }
        } catch {
            // Mark as failed
            if let idx = items.lastIndex(where: { $0.id == userItem.id }) {
                if case .user(var item) = items[idx] {
                    item.sendStatus = .failed
                    items[idx] = .user(item)
                }
            }
        }
    }

    func abort() async {
        try? await webSocket?.send(.abort)
        isAgentRunning = false
    }

    // MARK: - Event handling

    private func handleEvent(_ event: Relay.ServerEvent) {
        // Throttle only message streaming updates.
        if case .messageUpdate = event {
            pendingMessageUpdates.append(event)
            scheduleMessageUpdateFlushIfNeeded()
            return
        }

        // Keep ordering correct: flush pending streaming deltas first.
        flushPendingMessageUpdates()
        applyEvent(event)
    }

    private func applyEvent(_ event: Relay.ServerEvent) {
        eventSeq += 1

        switch event {
        case .agentStart, .turnStart:
            isAgentRunning = true
        case .agentEnd:
            isAgentRunning = false
        default:
            break
        }

        reducer.handle(event, items: &items, seq: eventSeq)
    }

    private func replayJournalEvents(upTo targetSeq: Int) async throws {
        guard targetSeq > 0 else { return }

        var afterSeq = 0
        while afterSeq < targetSeq {
            let limit = min(1000, targetSeq - afterSeq)
            let response = try await client.getSessionEvents(id: sessionId, afterSeq: afterSeq, limit: limit)
            if response.events.isEmpty { break }

            for entry in response.events {
                applyEvent(decodeJournalEvent(entry))
            }

            afterSeq = response.lastSeq
        }
    }

    private func decodeJournalEvent(_ entry: Relay.SessionEvent) -> Relay.ServerEvent {
        do {
            let data = try JSONEncoder().encode(entry.payload)
            return try JSONDecoder().decode(Relay.ServerEvent.self, from: data)
        } catch {
            return .unknown(type: entry.type, payload: entry.payload)
        }
    }

    private func scheduleMessageUpdateFlushIfNeeded() {
        guard messageUpdateFlushTask == nil else { return }

        messageUpdateFlushTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: messageUpdateFlushIntervalNs)
                self.flushPendingMessageUpdates()

                if self.pendingMessageUpdates.isEmpty {
                    self.messageUpdateFlushTask = nil
                    return
                }
            }
        }
    }

    private func flushPendingMessageUpdates() {
        guard !pendingMessageUpdates.isEmpty else { return }
        let batch = pendingMessageUpdates
        pendingMessageUpdates.removeAll(keepingCapacity: true)
        for event in batch {
            applyEvent(event)
        }
    }
}
