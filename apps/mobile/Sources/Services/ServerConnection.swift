//
//  ServerConnection.swift
//  Pi
//
//  Observable RPC client using WebSocketTransport from PiCore for iOS 26
//

import Foundation
import Observation
import PiCore
import PiUI

// MARK: - Server-specific Types

/// Information about a repository
public struct RepoInfo: Decodable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let fullName: String?
    public let owner: String?
    public let `private`: Bool?
    public let description: String?
    public let htmlUrl: String?
    public let cloneUrl: String?
    public let sshUrl: String?
    public let defaultBranch: String?
    public let path: String?
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
    public let sessions: [SessionInfo]
}

// MARK: - Connection Errors

public enum ServerConnectionError: Error, LocalizedError, Sendable {
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
            return "Already connected"
        case .invalidServerURL:
            return "Invalid server URL"
        case .transportError(let error):
            return error.localizedDescription
        }
    }

    static func from(_ error: RPCTransportError) -> Self {
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

// MARK: - Server Connection

/// Observable RPC client for iOS 26
@MainActor
@Observable
public final class ServerConnection {
    // MARK: - Observable State

    public private(set) var isConnected = false
    public private(set) var currentSessionId: String?

    // MARK: - Private State

    private var transport: WebSocketTransport?
    private var eventTask: Task<Void, Never>?

    /// Active event subscribers - each gets their own continuation
    private var eventSubscribers: [UUID: AsyncStream<RPCEvent>.Continuation] = [:]

    /// Native tool executor for handling tool requests from server
    private let nativeToolExecutor = NativeToolExecutor()

    public let serverURL: URL
    private let clientInfo: ClientInfo

    // MARK: - Initialization

    public init(
        serverURL: URL,
        clientName: String = "pi-mobile",
        clientVersion: String = "1.0"
    ) {
        self.serverURL = serverURL
        self.clientInfo = ClientInfo(name: clientName, version: clientVersion)
    }

    // Note: Tasks are cancelled automatically when the instance is deallocated
    // because they reference self and won't outlive the connection

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

    // MARK: - Connection

    public func connect() async throws {
        guard !isConnected else {
            throw ServerConnectionError.alreadyConnected
        }

        print("[ServerConnection] Connecting to \(serverURL)")
        let config = RPCTransportConfig.remote(url: serverURL, clientInfo: clientInfo)
        let newTransport = WebSocketTransport(config: config)
        transport = newTransport

        do {
            // Connect with native tools (only those that are available)
            try await newTransport.connect(nativeTools: NativeTool.availableDefinitions)
            isConnected = await newTransport.isConnected

            if !isConnected {
                transport = nil
                throw ServerConnectionError.notConnected
            }

            startEventForwarding()
            print("[ServerConnection] Connected with \(NativeTool.availableDefinitions.count) native tools")

        } catch let error as RPCTransportError {
            transport = nil
            isConnected = false
            throw ServerConnectionError.from(error)
        }
    }

    public func disconnect() async {
        guard isConnected else { return }

        isConnected = false
        currentSessionId = nil
        eventTask?.cancel()
        eventTask = nil

        if let t = transport {
            await t.disconnect()
        }
        transport = nil

        finishAllSubscribers()
    }

    // MARK: - Generic Send

    private func send<R: Decodable & Sendable>(
        method: String,
        sessionId: String? = nil,
        params: (any Encodable & Sendable)? = nil
    ) async throws -> R {
        guard isConnected, let transport else {
            throw ServerConnectionError.notConnected
        }

        do {
            return try await transport.send(
                method: method,
                sessionId: sessionId ?? currentSessionId,
                params: params
            )
        } catch let error as RPCTransportError {
            let stillConnected = await transport.isConnected
            if !stillConnected {
                isConnected = false
            }
            throw ServerConnectionError.from(error)
        }
    }

    private func sendVoid(
        method: String,
        sessionId: String? = nil,
        params: (any Encodable & Sendable)? = nil
    ) async throws {
        guard isConnected, let transport else {
            throw ServerConnectionError.notConnected
        }

        do {
            try await transport.sendVoid(
                method: method,
                sessionId: sessionId ?? currentSessionId,
                params: params
            )
        } catch let error as RPCTransportError {
            let stillConnected = await transport.isConnected
            if !stillConnected {
                isConnected = false
            }
            throw ServerConnectionError.from(error)
        }
    }

    // MARK: - Repository Operations

    public func listRepos() async throws -> [RepoInfo] {
        let result: ReposListResult = try await send(method: "repos.list")
        return result.repos
    }

    // MARK: - Session Operations

    public func createSession(
        mode: SessionMode,
        repoId: String? = nil,
        preferredProvider: String? = nil,
        preferredModelId: String? = nil,
        systemPrompt: String? = nil
    ) async throws -> SessionCreateResult {
        struct CreateSessionParams: Encodable, Sendable {
            let mode: String
            let repoId: String?
            let provider: String?
            let modelId: String?
            let systemPrompt: String?
        }

        return try await send(
            method: "session.create",
            params: CreateSessionParams(
                mode: mode.rawValue,
                repoId: repoId,
                provider: preferredProvider,
                modelId: preferredModelId,
                systemPrompt: systemPrompt
            )
        )
    }

    /// Create a chat session (no repo needed)
    public func createChatSession(systemPrompt: String? = nil) async throws -> SessionCreateResult {
        try await createSession(mode: .chat, systemPrompt: systemPrompt)
    }

    /// Create a code session for a specific repo
    public func createCodeSession(repoId: String) async throws -> SessionCreateResult {
        try await createSession(mode: .code, repoId: repoId)
    }

    public func listSessions(repoId: String? = nil) async throws -> [SessionInfo] {
        struct ListSessionsParams: Encodable, Sendable {
            let repoId: String?
        }

        let result: SessionListResult = try await send(
            method: "session.list",
            params: repoId != nil ? ListSessionsParams(repoId: repoId) : nil
        )
        return result.sessions
    }

    @discardableResult
    public func attachSession(sessionId: String) async throws -> ModelInfo? {
        struct AttachSessionParams: Encodable, Sendable {
            let sessionId: String
        }

        let response: AttachSessionResponse = try await send(
            method: "session.attach",
            params: AttachSessionParams(sessionId: sessionId)
        )

        currentSessionId = sessionId
        return response.currentModel
    }

    public func detachSession() async throws {
        guard currentSessionId != nil else { return }

        try await sendVoid(method: "session.detach")
        currentSessionId = nil
    }

    public func deleteSession(sessionId: String) async throws {
        struct DeleteSessionParams: Encodable, Sendable {
            let sessionId: String
        }

        try await sendVoid(
            method: "session.delete",
            params: DeleteSessionParams(sessionId: sessionId)
        )

        if currentSessionId == sessionId {
            currentSessionId = nil
        }
    }

    // MARK: - Agent Operations

    public func prompt(_ message: String, streamingBehavior: StreamingBehavior? = nil) async throws {
        let command = PromptCommand(message: message, streamingBehavior: streamingBehavior)
        try await sendVoid(method: command.type, params: command)
    }

    public func abort() async throws {
        let command = AbortCommand()
        try await sendVoid(method: command.type, params: command)
    }

    public func getState(sessionId: String) async throws -> GetStateResponse {
        let command = GetStateCommand()
        return try await send(method: command.type, sessionId: sessionId, params: command)
    }

    public func getAvailableModels() async throws -> GetAvailableModelsResponse {
        let command = GetAvailableModelsCommand()
        return try await send(method: command.type, params: command)
    }

    @discardableResult
    public func setModel(provider: String, modelId: String, sessionId: String) async throws -> ModelInfo {
        let command = SetModelCommand(provider: provider, modelId: modelId)
        let response: SetModelResponse = try await send(method: command.type, sessionId: sessionId, params: command)
        return response.model
    }

    public func getDefaultModel() async throws -> ModelInfo? {
        let command = GetDefaultModelCommand()
        let response: GetDefaultModelResponse = try await send(method: command.type, params: command)
        return response.defaultModel
    }

    @discardableResult
    public func setDefaultModel(provider: String, modelId: String) async throws -> ModelInfo {
        let command = SetDefaultModelCommand(provider: provider, modelId: modelId)
        let response: SetDefaultModelResponse = try await send(method: command.type, params: command)
        return response.defaultModel
    }

    public func getMessages() async throws -> GetMessagesResponse {
        let command = GetMessagesCommand()
        return try await send(method: command.type, params: command)
    }

    public func clearConversation() async throws {
        let command = ClearConversationCommand()
        try await sendVoid(method: command.type, params: command)
    }

    // MARK: - Event Forwarding

    private func startEventForwarding() {
        guard let transport else { return }

        eventTask = Task { [weak self] in
            let eventStream = await transport.events

            for await transportEvent in eventStream {
                guard let self, !Task.isCancelled else { break }

                switch transportEvent.event {
                case .nativeToolRequest(let request):
                    // Handle in background, don't block event stream
                    Task {
                        await self.handleNativeToolRequest(
                            sessionId: transportEvent.sessionId,
                            request: request
                        )
                    }

                case .nativeToolCancel(let callId):
                    await self.nativeToolExecutor.cancel(callId: callId)

                default:
                    // Broadcast other events to subscribers
                    await MainActor.run {
                        self.broadcastEvent(transportEvent.event)
                    }
                }
            }

            // Transport disconnected
            if let self, self.isConnected {
                await MainActor.run {
                    self.isConnected = false
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

    private func handleNativeToolRequest(sessionId: String, request: NativeToolRequest) async {
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
                            // This will be picked up by ConversationView subscribers
                            // For now, we'll just log it - actual UI integration will happen
                            // when we wire up the Engine to handle these items
                            print("[ServerConnection] Rich content detected: \(displayContent)")
                        }
                    }
                }
            }

            // Convert JSON Data back to dictionary
            let result = try JSONSerialization.jsonObject(with: resultData) as? [String: Any]
            print("[ServerConnection] Native tool \(request.toolName) succeeded")

            try await sendNativeToolResponse(
                sessionId: sessionId,
                callId: request.callId,
                result: result
            )
        } catch {
            print("[ServerConnection] Native tool \(request.toolName) failed: \(error)")

            try? await sendNativeToolResponse(
                sessionId: sessionId,
                callId: request.callId,
                error: error.localizedDescription
            )
        }
    }

    private func sendNativeToolResponse(
        sessionId: String,
        callId: String,
        result: [String: Any]? = nil,
        error: String? = nil
    ) async throws {
        guard isConnected, let transport else {
            throw ServerConnectionError.notConnected
        }

        let params = NativeToolResponseParams(
            callId: callId,
            result: result,
            error: error.map { NativeToolErrorInfo(message: $0) }
        )

        try await transport.sendVoid(
            method: "native_tool_response",
            sessionId: sessionId,
            params: params
        )
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
