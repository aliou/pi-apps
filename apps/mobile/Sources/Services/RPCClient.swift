//
//  RPCClient.swift
//  pi-mobile
//
//  RPC client using WebSocketTransport from PiCore for iOS
//

import Foundation
import PiCore

// MARK: - Server-specific Types

/// Information about a repository
public struct RepoInfo: Decodable, Sendable {
    public let id: String
    public let name: String
    public let path: String
}

/// Result from listing repositories
public struct ReposListResult: Decodable, Sendable {
    public let repos: [RepoInfo]
}

/// Result from creating a session
public struct SessionCreateResult: Decodable, Sendable {
    public let sessionId: String
}

/// Result from listing sessions
public struct SessionListResult: Decodable, Sendable {
    public let sessions: [SessionInfoResult]
}

/// Information about a session
public struct SessionInfoResult: Decodable, Sendable, Identifiable {
    public let sessionId: String
    public let repoId: String
    public let createdAt: String?
    public let lastActivityAt: String?

    public var id: String { sessionId }
}

// MARK: - RPC Client Errors

public enum RPCClientError: Error, LocalizedError, Sendable {
    case notRunning
    case notConnected
    case encodingFailed
    case decodingFailed(String)
    case requestTimeout
    case requestCancelled
    case invalidResponse(String)
    case serverError(RPCError)
    case connectionLost(String)
    case alreadyConnected
    case invalidServerURL
    case transportError(RPCTransportError)

    public var errorDescription: String? {
        switch self {
        case .notRunning:
            return "RPC client is not running"
        case .notConnected:
            return "Not connected to server"
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
        case .serverError(let error):
            return error.message
        case .connectionLost(let reason):
            return "Connection lost: \(reason)"
        case .alreadyConnected:
            return "RPC client is already connected"
        case .invalidServerURL:
            return "Invalid server URL"
        case .transportError(let error):
            return error.localizedDescription
        }
    }

    /// Create from transport error
    public static func from(_ error: RPCTransportError) -> Self {
        switch error {
        case .notConnected:
            return .notConnected
        case .connectionFailed(let reason):
            return .connectionLost(reason)
        case .connectionLost(let reason):
            return .connectionLost(reason)
        case .encodingFailed:
            return .encodingFailed
        case .decodingFailed(let details):
            return .decodingFailed(details)
        case .timeout:
            return .requestTimeout
        case .cancelled:
            return .requestCancelled
        case .invalidResponse(let details):
            return .invalidResponse(details)
        case .serverError(let rpcError):
            return .serverError(rpcError)
        }
    }
}

// MARK: - RPC Client Actor

/// Actor-based RPC client that uses WebSocketTransport from PiCore
public actor RPCClient {
    // MARK: - Properties

    private var transport: WebSocketTransport?
    private var eventTask: Task<Void, Never>?

    private var eventsContinuation: AsyncStream<RPCEvent>.Continuation?
    private var _events: AsyncStream<RPCEvent>?

    private var _isConnected = false

    private let serverURL: URL
    private let clientInfo: ClientInfo

    /// The currently attached session ID
    private var _currentSessionId: String?

    // MARK: - Initialization

    /// Initialize with a server URL
    /// - Parameters:
    ///   - serverURL: The WebSocket server URL
    ///   - clientName: Name to identify this client (default: "pi-mobile")
    ///   - clientVersion: Client version (default: "1.0")
    public init(
        serverURL: URL,
        clientName: String = "pi-mobile",
        clientVersion: String = "1.0"
    ) {
        self.serverURL = serverURL
        self.clientInfo = ClientInfo(name: clientName, version: clientVersion)
    }

    deinit {
        eventTask?.cancel()
    }

    // MARK: - Public Interface

    /// Stream of events from the RPC server
    public var events: AsyncStream<RPCEvent> {
        get async {
            if let existing = _events {
                return existing
            }

            let (stream, continuation) = AsyncStream<RPCEvent>.makeStream(
                bufferingPolicy: .bufferingNewest(100)
            )
            self.eventsContinuation = continuation
            self._events = stream
            return stream
        }
    }

    /// Whether the client is currently connected
    public var isConnected: Bool {
        _isConnected
    }

    /// The currently attached session ID
    public var currentSessionId: String? {
        _currentSessionId
    }

    /// Connect to the WebSocket server
    public func connect() async throws {
        guard !_isConnected else {
            throw RPCClientError.alreadyConnected
        }

        print("[RPCClient] Connecting to \(serverURL)")
        let config = RPCTransportConfig.remote(url: serverURL, clientInfo: clientInfo)
        let newTransport = WebSocketTransport(config: config)
        transport = newTransport

        do {
            print("[RPCClient] Calling transport.connect()...")
            try await newTransport.connect()
            _isConnected = await newTransport.isConnected
            print("[RPCClient] Transport connected: \(_isConnected)")

            if !_isConnected {
                transport = nil
                throw RPCClientError.notConnected
            }

            // Start forwarding events from transport to our event stream
            startEventForwarding()
            print("[RPCClient] Connection established")

        } catch let error as RPCTransportError {
            print("[RPCClient] Transport error: \(error)")
            transport = nil
            _isConnected = false
            throw RPCClientError.from(error)
        } catch {
            print("[RPCClient] Other error: \(error)")
            throw error
        }
    }

    /// Disconnect from the server
    public func disconnect() async {
        guard _isConnected else { return }

        _isConnected = false
        _currentSessionId = nil
        eventTask?.cancel()
        eventTask = nil

        if let t = transport {
            await t.disconnect()
        }
        transport = nil

        // End event stream
        eventsContinuation?.finish()
        _events = nil
        eventsContinuation = nil
    }

    // MARK: - Generic Send Methods

    /// Send a request and wait for typed response
    public func send<R: Decodable & Sendable>(
        method: String,
        sessionId: String? = nil,
        params: (any Encodable & Sendable)? = nil
    ) async throws -> R {
        guard _isConnected, let transport else {
            throw RPCClientError.notConnected
        }

        do {
            return try await transport.send(
                method: method,
                sessionId: sessionId ?? _currentSessionId,
                params: params
            )
        } catch let error as RPCTransportError {
            let stillConnected = await transport.isConnected
            if !stillConnected {
                _isConnected = false
            }
            throw RPCClientError.from(error)
        }
    }

    /// Send a request that returns no data (void response)
    public func sendVoid(
        method: String,
        sessionId: String? = nil,
        params: (any Encodable & Sendable)? = nil
    ) async throws {
        guard _isConnected, let transport else {
            throw RPCClientError.notConnected
        }

        do {
            try await transport.sendVoid(
                method: method,
                sessionId: sessionId ?? _currentSessionId,
                params: params
            )
        } catch let error as RPCTransportError {
            let stillConnected = await transport.isConnected
            if !stillConnected {
                _isConnected = false
            }
            throw RPCClientError.from(error)
        }
    }

    /// Send a command and wait for response (legacy command interface)
    public func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R {
        try await send(method: command.type, params: command)
    }

    /// Send a command that returns no data (legacy command interface)
    public func send<C: RPCCommand>(_ command: C) async throws {
        try await sendVoid(method: command.type, params: command)
    }

    // MARK: - Server-specific Operations

    /// List all available repositories
    public func listRepos() async throws -> [RepoInfo] {
        let result: ReposListResult = try await send(method: "repos.list")
        return result.repos
    }

    /// Create a new session for a repository
    /// - Parameter repoId: The repository ID to create a session for
    /// - Returns: The created session info
    public func createSession(repoId: String) async throws -> SessionCreateResult {
        struct CreateSessionParams: Encodable, Sendable {
            let repoId: String
        }

        return try await send(
            method: "session.create",
            params: CreateSessionParams(repoId: repoId)
        )
    }

    /// List all sessions (optionally filtered by repo)
    /// - Parameter repoId: Optional repository ID to filter sessions
    /// - Returns: List of sessions
    public func listSessions(repoId: String? = nil) async throws -> [SessionInfoResult] {
        struct ListSessionsParams: Encodable, Sendable {
            let repoId: String?
        }

        let result: SessionListResult = try await send(
            method: "session.list",
            params: repoId != nil ? ListSessionsParams(repoId: repoId) : nil
        )
        return result.sessions
    }

    /// Attach to an existing session
    /// - Parameter sessionId: The session ID to attach to
    public func attachSession(sessionId: String) async throws {
        struct AttachSessionParams: Encodable, Sendable {
            let sessionId: String
        }

        try await sendVoid(
            method: "session.attach",
            params: AttachSessionParams(sessionId: sessionId)
        )

        _currentSessionId = sessionId
    }

    /// Detach from the current session
    public func detachSession() async throws {
        guard _currentSessionId != nil else { return }

        try await sendVoid(method: "session.detach")
        _currentSessionId = nil
    }

    /// Delete a session
    /// - Parameter sessionId: The session ID to delete
    public func deleteSession(sessionId: String) async throws {
        struct DeleteSessionParams: Encodable, Sendable {
            let sessionId: String
        }

        try await sendVoid(
            method: "session.delete",
            params: DeleteSessionParams(sessionId: sessionId)
        )

        // If we deleted the current session, clear it
        if _currentSessionId == sessionId {
            _currentSessionId = nil
        }
    }

    // MARK: - Agent Operations

    /// Send a prompt to the agent
    /// - Parameter message: The message to send
    public func prompt(_ message: String) async throws {
        let command = PromptCommand(message: message)
        try await send(command) as Void
    }

    /// Abort ongoing operation
    public func abort() async throws {
        let command = AbortCommand()
        try await send(command) as Void
    }

    /// Get current state
    public func getState() async throws -> GetStateResponse {
        let command = GetStateCommand()
        return try await send(command)
    }

    /// Get available models
    public func getAvailableModels() async throws -> GetAvailableModelsResponse {
        let command = GetAvailableModelsCommand()
        return try await send(command)
    }

    /// Set the active model
    /// - Parameters:
    ///   - provider: The model provider
    ///   - modelId: The model ID
    public func setModel(provider: String, modelId: String) async throws {
        let command = SetModelCommand(provider: provider, modelId: modelId)
        try await send(command) as Void
    }

    /// Get conversation history
    public func getMessages() async throws -> GetMessagesResponse {
        let command = GetMessagesCommand()
        return try await send(command)
    }

    /// Clear conversation
    public func clearConversation() async throws {
        let command = ClearConversationCommand()
        try await send(command) as Void
    }

    // MARK: - Private Methods

    private func startEventForwarding() {
        guard let transport else { return }

        // Ensure event stream exists before starting to forward
        // This creates the continuation that forwardEvent will use
        if _events == nil {
            let (stream, continuation) = AsyncStream<RPCEvent>.makeStream(
                bufferingPolicy: .bufferingNewest(100)
            )
            self.eventsContinuation = continuation
            self._events = stream
        }

        eventTask = Task { [weak self] in
            let eventStream = await transport.events

            for await transportEvent in eventStream {
                guard let self, !Task.isCancelled else { break }

                // Forward the event (TransportEvent contains RPCEvent)
                await self.forwardEvent(transportEvent.event)
            }

            // Transport event stream ended - mark as not connected
            if let self {
                await self.handleTransportDisconnect()
            }
        }
    }

    private func forwardEvent(_ event: RPCEvent) {
        eventsContinuation?.yield(event)
    }

    private func handleTransportDisconnect() {
        guard _isConnected else { return }

        _isConnected = false

        // Signal end with an error event
        eventsContinuation?.yield(.agentEnd(
            success: false,
            error: RPCError(
                code: "transport_disconnect",
                message: "WebSocket connection lost",
                details: nil
            )
        ))
        eventsContinuation?.finish()
    }
}

// MARK: - Convenience Extensions

extension RPCClient {
    /// Create a client from ServerConfig
    /// Note: Internal access level since ServerConfig is internal
    /// Note: MainActor since ServerConfig is MainActor-isolated
    @MainActor
    static func fromConfig(_ config: ServerConfig) -> RPCClient? {
        guard let url = config.serverURL else {
            return nil
        }
        return RPCClient(serverURL: url)
    }

    /// Create a client with a URL string
    nonisolated public static func withURL(_ urlString: String) -> RPCClient? {
        guard let url = URL(string: urlString) else {
            return nil
        }
        return RPCClient(serverURL: url)
    }
}
