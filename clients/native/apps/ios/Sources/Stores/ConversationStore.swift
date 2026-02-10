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

    /// Load history from REST, then connect WebSocket for live events.
    func connect() async {
        if connectionState == .connecting || connectionState == .connected { return }

        connectionState = .connecting

        // 1. Load history via REST
        do {
            let historyResponse = try await client.getSessionHistory(id: sessionId)
            items = Client.parseHistory(historyResponse.entries)
        } catch {
            // History load failure is non-fatal; start with empty
            items = []
        }

        // 2. Activate session (ensures sandbox is running)
        do {
            _ = try await client.activateSession(id: sessionId)
            eventSeq = 0
        } catch {
            connectionState = .error(error.localizedDescription)
            return
        }

        // 3. Connect WebSocket for live events
        let baseURL = await client.baseURL
        let webSocketConnection = Relay.RelayWebSocket(sessionId: sessionId, baseURL: baseURL, lastSeq: 0)
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
