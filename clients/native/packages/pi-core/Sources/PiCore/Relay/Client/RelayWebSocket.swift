import Foundation
import os

extension Relay {
    public final class RelayWebSocket: Sendable {
        private let sessionId: String
        private let baseURL: URL
        private let state: RelayWebSocketState

        public init(sessionId: String, baseURL: URL, lastSeq: Int = 0) {
            self.sessionId = sessionId
            self.baseURL = baseURL
            self.state = RelayWebSocketState(lastSeq: lastSeq)
        }

        /// Connect and return an AsyncStream of server events.
        public func connect() -> AsyncStream<ServerEvent> {
            AsyncStream { continuation in
                let task = Task { [sessionId, baseURL, state] in
                    await state.setContinuation(continuation)
                    await state.startConnection(sessionId: sessionId, baseURL: baseURL)

                    continuation.onTermination = { @Sendable _ in
                        Task { await state.disconnect() }
                    }
                }
                continuation.onTermination = { @Sendable _ in
                    task.cancel()
                }
            }
        }

        /// Send a command to the server.
        public func send(_ command: ClientCommand) async throws {
            let data = try JSONEncoder().encode(command)
            try await state.send(data)
        }

        /// Disconnect the WebSocket.
        public func disconnect() async {
            await state.disconnect()
        }
    }
}

// Internal actor to manage mutable WebSocket state
private actor RelayWebSocketState {
    private var lastSeq: Int
    private var task: URLSessionWebSocketTask?
    private var continuation: AsyncStream<Relay.ServerEvent>.Continuation?
    private var reconnectAttempts = 0
    private static let maxReconnectDelay: TimeInterval = 30
    private let logger = Logger(subsystem: "dev.378labs.pi", category: "RelayWebSocket")

    init(lastSeq: Int) {
        self.lastSeq = lastSeq
    }

    func setContinuation(_ continuation: AsyncStream<Relay.ServerEvent>.Continuation) {
        self.continuation = continuation
    }

    func send(_ data: Data) async throws {
        guard let task else { return }
        try await task.send(.data(data))
    }

    func disconnect() {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        continuation?.finish()
        continuation = nil
    }

    func startConnection(sessionId: String, baseURL: URL) {
        // Use http/https scheme with URLRequest-based webSocketTask.
        // webSocketTask(with: URL) requires ws/wss, but that causes
        // URLSession to send the full absolute URI in the HTTP request
        // line (e.g. "GET ws://host/path"), which many servers can't route.
        // webSocketTask(with: URLRequest) accepts http/https and sends
        // only the path in the request line.
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = "/ws/sessions/\(sessionId)"
        components.queryItems = [URLQueryItem(name: "lastSeq", value: "\(lastSeq)")]

        guard let url = components.url else { return }
        let wsTask = URLSession.shared.webSocketTask(with: URLRequest(url: url))
        self.task = wsTask
        wsTask.resume()
        reconnectAttempts = 0
        receiveLoop(sessionId: sessionId, baseURL: baseURL)
    }

    private func receiveLoop(sessionId: String, baseURL: URL) {
        guard let task else { return }
        task.receive { [weak self] result in
            guard let self else { return }
            Task {
                switch result {
                case .success(let message):
                    await self.handleMessage(message)
                    await self.receiveLoop(sessionId: sessionId, baseURL: baseURL)
                case .failure(let error):
                    await self.handleDisconnect(
                        error: error, sessionId: sessionId, baseURL: baseURL
                    )
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .data(let rawData): data = rawData
        case .string(let text): data = Data(text.utf8)
        @unknown default: return
        }

        do {
            let event = try JSONDecoder().decode(Relay.ServerEvent.self, from: data)
            if case .connected(_, let seq) = event {
                lastSeq = seq
            }
            continuation?.yield(event)
        } catch {
            logger.error("Failed to decode server event: \(error)")
        }
    }

    private func handleDisconnect(error: Error, sessionId: String, baseURL: URL) {
        task = nil
        reconnectAttempts += 1
        let delay = min(
            pow(2.0, Double(reconnectAttempts)) + Double.random(in: 0...1),
            Self.maxReconnectDelay
        )
        logger.info("WebSocket disconnected, reconnecting in \(delay)s (attempt \(self.reconnectAttempts))")

        Task {
            try? await Task.sleep(for: .seconds(delay))
            guard continuation != nil else { return } // cancelled
            startConnection(sessionId: sessionId, baseURL: baseURL)
        }
    }
}
