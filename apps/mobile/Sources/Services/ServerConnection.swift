//
//  ServerConnection.swift
//  Pi
//
//  Observable client for relay server using REST + WebSocket
//

import Foundation
import Observation
import PiCore
import PiUI

// MARK: - Connection Errors

public enum ServerConnectionError: Error, LocalizedError, Sendable {
    case notConnected
    case sessionNotConnected
    case encodingFailed
    case decodingFailed(String)
    case requestTimeout
    case requestCancelled
    case invalidResponse(String)
    case serverError(String)
    case connectionLost(String)
    case alreadyConnected
    case invalidServerURL
    case sandboxNotReady
    case apiError(RelayAPIError)
    case agentError(AgentConnectionError)

    public var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to server"
        case .sessionNotConnected:
            return "No active session"
        case .encodingFailed:
            return "Failed to encode command"
        case .decodingFailed(let details):
            return "Failed to decode response: \(details)"
        case .requestTimeout:
            return "Request timed out"
        case .requestCancelled:
            return "Request was cancelled"
        case .invalidResponse(let details):
            return "Invalid response: \(details)"
        case .serverError(let message):
            return message
        case .connectionLost(let reason):
            return "Connection lost: \(reason)"
        case .alreadyConnected:
            return "Already connected"
        case .invalidServerURL:
            return "Invalid server URL"
        case .sandboxNotReady:
            return "Sandbox not ready"
        case .apiError(let error):
            return error.localizedDescription
        case .agentError(let error):
            return error.localizedDescription
        }
    }
}

// MARK: - Server Connection

/// Observable client for relay server using REST + WebSocket
@MainActor
@Observable
public final class ServerConnection {
    // MARK: - Observable State

    public private(set) var isServerReachable = false
    public private(set) var serverVersion: String?
    public private(set) var currentSession: RelaySession?
    public var isSessionConnected: Bool { agentConnection?.isConnected ?? false }

    // MARK: - Private State

    public let serverURL: URL
    public let api: RelayAPIClient
    private var agentConnection: RemoteAgentConnection?
    private var eventTask: Task<Void, Never>?

    /// Active event subscribers - each gets their own continuation
    private var eventSubscribers: [UUID: AsyncStream<RPCEvent>.Continuation] = [:]

    /// Native tool executor for handling tool requests from server
    private let nativeToolExecutor = NativeToolExecutor()

    // MARK: - Initialization

    public init(serverURL: URL) {
        self.serverURL = serverURL
        self.api = RelayAPIClient(baseURL: serverURL)
    }

    // MARK: - Health

    public func checkHealth() async throws {
        do {
            let health = try await api.health()
            isServerReachable = health.ok
            serverVersion = health.version
        } catch let error as RelayAPIError {
            isServerReachable = false
            serverVersion = nil
            throw ServerConnectionError.apiError(error)
        }
    }

    // MARK: - Events Stream

    /// Creates a new event stream for each subscriber (broadcast pattern)
    public func subscribe() -> AsyncStream<RPCEvent> {
        let subscriberId = UUID()

        return AsyncStream<RPCEvent> { continuation in
            // Store continuation for broadcasting
            self.eventSubscribers[subscriberId] = continuation

            // Remove on termination
            continuation.onTermination = { @Sendable _ in
                Task { @MainActor in
                    self.eventSubscribers.removeValue(forKey: subscriberId)
                }
            }
        }
    }

    /// Broadcast an event to all subscribers
    private func broadcastEvent(_ event: RPCEvent) {
        for continuation in eventSubscribers.values {
            continuation.yield(event)
        }
    }

    /// Finish all subscriber streams
    private func finishAllSubscribers() {
        for continuation in eventSubscribers.values {
            continuation.finish()
        }
        eventSubscribers.removeAll()
    }

    // MARK: - Environments (REST)

    public func listEnvironments() async throws -> [RelayEnvironment] {
        do {
            return try await api.listEnvironments()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    // MARK: - Session Management (REST)

    public func listSessions() async throws -> [RelaySession] {
        do {
            return try await api.listSessions()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func createSession(
        mode: SessionMode,
        repoId: String? = nil,
        environmentId: String? = nil,
        modelProvider: String? = nil,
        modelId: String? = nil,
        systemPrompt: String? = nil
    ) async throws -> RelaySession {
        let params = CreateSessionParams(
            mode: mode,
            repoId: repoId,
            environmentId: environmentId,
            modelProvider: modelProvider,
            modelId: modelId,
            systemPrompt: systemPrompt
        )
        do {
            return try await api.createSession(params)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    /// Create a chat session (no repo needed)
    public func createChatSession(systemPrompt: String? = nil) async throws -> RelaySession {
        try await createSession(mode: .chat, systemPrompt: systemPrompt)
    }

    /// Create a code session for a specific repo
    public func createCodeSession(repoId: String) async throws -> RelaySession {
        try await createSession(mode: .code, repoId: repoId)
    }

    public func getSession(id: String) async throws -> RelaySession {
        do {
            return try await api.getSession(id: id)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func deleteSession(id: String) async throws {
        do {
            try await api.deleteSession(id: id)
            if currentSession?.id == id {
                await disconnectFromSession()
            }
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    // MARK: - Session Connection (WebSocket)

    public func connectToSession(_ session: RelaySession) async throws {
        // Disconnect from current session if any
        await disconnectFromSession()

        do {
            // Wait for sandbox to be ready (poll with backoff)
            let maxAttempts = 30  // 30 seconds max
            var attempts = 0
            while attempts < maxAttempts {
                let info = try await api.getConnectionInfo(sessionId: session.id)
                if info.sandboxReady {
                    break
                }
                attempts += 1
                if attempts >= maxAttempts {
                    throw ServerConnectionError.sandboxNotReady
                }
                print("[ServerConnection] Sandbox not ready, waiting... (attempt \(attempts)/\(maxAttempts))")
                try await Task.sleep(nanoseconds: 1_000_000_000)  // 1 second
            }

            // Create and connect
            let connection = RemoteAgentConnection(baseURL: serverURL, sessionId: session.id)
            try await connection.connect()

            agentConnection = connection
            currentSession = session
            startEventForwarding()

            print("[ServerConnection] Connected to session \(session.id)")
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    public func disconnectFromSession() async {
        eventTask?.cancel()
        eventTask = nil

        if let connection = agentConnection {
            await connection.disconnect()
        }
        agentConnection = nil
        currentSession = nil

        finishAllSubscribers()
    }

    // MARK: - Agent Commands (via WebSocket)

    public func prompt(_ message: String, streamingBehavior: StreamingBehavior? = nil) async throws {
        guard let connection = agentConnection else {
            throw ServerConnectionError.sessionNotConnected
        }
        do {
            try await connection.prompt(message, streamingBehavior: streamingBehavior)
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    public func abort() async throws {
        guard let connection = agentConnection else {
            throw ServerConnectionError.sessionNotConnected
        }
        do {
            try await connection.abort()
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    /// Get available models.
    /// If connected to a session, uses RPC (includes extension-defined providers).
    /// If not connected, uses REST API (built-in providers only).
    public func getAvailableModels() async throws -> GetAvailableModelsResponse {
        // If connected to session, use RPC for full list including extensions
        if let connection = agentConnection {
            do {
                return try await connection.getAvailableModels()
            } catch let error as AgentConnectionError {
                throw ServerConnectionError.agentError(error)
            }
        }

        // Otherwise use REST API for built-in providers
        do {
            let models = try await api.getModels()
            return GetAvailableModelsResponse(models: models)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func setModel(provider: String, modelId: String) async throws {
        guard let connection = agentConnection else {
            throw ServerConnectionError.sessionNotConnected
        }
        do {
            try await connection.setModel(provider: provider, modelId: modelId)
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    public func getState() async throws -> GetStateResponse {
        guard let connection = agentConnection else {
            throw ServerConnectionError.sessionNotConnected
        }
        do {
            return try await connection.getState()
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    public func getMessages() async throws -> GetMessagesResponse {
        guard let connection = agentConnection else {
            throw ServerConnectionError.sessionNotConnected
        }
        do {
            return try await connection.getMessages()
        } catch let error as AgentConnectionError {
            throw ServerConnectionError.agentError(error)
        }
    }

    // MARK: - GitHub (REST)

    public func getGitHubTokenStatus() async throws -> GitHubTokenStatus {
        do {
            return try await api.getGitHubTokenStatus()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func setGitHubToken(_ token: String) async throws {
        do {
            _ = try await api.setGitHubToken(token)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func deleteGitHubToken() async throws {
        do {
            try await api.deleteGitHubToken()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func listRepos() async throws -> [RepoInfo] {
        do {
            return try await api.listRepos()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    // MARK: - Secrets (REST)

    public func listSecrets() async throws -> [SecretMetadata] {
        do {
            return try await api.listSecrets()
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func setSecret(id: SecretId, value: String) async throws {
        do {
            try await api.setSecret(id: id, value: value)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    public func deleteSecret(id: SecretId) async throws {
        do {
            try await api.deleteSecret(id: id)
        } catch let error as RelayAPIError {
            throw ServerConnectionError.apiError(error)
        }
    }

    // MARK: - Event Forwarding

    private func startEventForwarding() {
        guard let connection = agentConnection else { return }

        eventTask = Task { [weak self] in
            let eventStream = connection.subscribe()

            for await event in eventStream {
                guard let self, !Task.isCancelled else { break }

                switch event {
                case .nativeToolRequest(let request):
                    // Handle in background, don't block event stream
                    Task {
                        await self.handleNativeToolRequest(request: request)
                    }

                case .nativeToolCancel(let callId):
                    await self.nativeToolExecutor.cancel(callId: callId)

                default:
                    // Broadcast other events to subscribers
                    await MainActor.run {
                        self.broadcastEvent(event)
                    }
                }
            }

            // Connection disconnected
            if let self, self.isSessionConnected {
                await MainActor.run {
                    self.broadcastEvent(.agentEnd(
                        success: false,
                        error: RPCError(
                            code: "transport_disconnect",
                            message: "WebSocket connection lost",
                            details: nil
                        )
                    ))
                    self.finishAllSubscribers()
                }
            }
        }
    }

    // MARK: - Native Tool Handling

    private func handleNativeToolRequest(request: NativeToolRequest) async {
        print("[ServerConnection] Handling native tool request: \(request.toolName)")

        do {
            let resultData = try await nativeToolExecutor.execute(request: request)

            // Check if result contains _display field for rich content
            if let parsed = NativeToolExecutor.parseResult(resultData) {
                // If we have display content, broadcast it to UI
                if let displayContent = parsed.displayContent {
                    await MainActor.run {
                        if let item = ConversationItem.rich(
                            from: DisplayEnvelope(display: displayContent, summary: parsed.summary),
                            id: request.callId
                        ) {
                            print("[ServerConnection] Rich content detected: \(displayContent)")
                        }
                    }
                }
            }

            // Convert JSON Data back to dictionary
            let result = try JSONSerialization.jsonObject(with: resultData) as? [String: Any]
            print("[ServerConnection] Native tool \(request.toolName) succeeded")

            try await sendNativeToolResponse(
                callId: request.callId,
                result: result
            )
        } catch {
            print("[ServerConnection] Native tool \(request.toolName) failed: \(error)")

            try? await sendNativeToolResponse(
                callId: request.callId,
                error: error.localizedDescription
            )
        }
    }

    private func sendNativeToolResponse(
        callId: String,
        result: [String: Any]? = nil,
        error: String? = nil
    ) async throws {
        // For now, native tool responses need to go through the WebSocket
        // This will be implemented when the relay server supports native tools
        print("[ServerConnection] Native tool response: \(callId), result: \(result != nil), error: \(error ?? "nil")")
    }
}

// MARK: - Convenience

extension ServerConnection {
    @MainActor
    static func fromConfig(_ config: ServerConfig) -> ServerConnection? {
        guard let url = config.serverURL else {
            return nil
        }
        return ServerConnection(serverURL: url)
    }

    @MainActor
    static func withURL(_ urlString: String) -> ServerConnection? {
        guard let url = URL(string: urlString) else {
            return nil
        }
        return ServerConnection(serverURL: url)
    }
}
