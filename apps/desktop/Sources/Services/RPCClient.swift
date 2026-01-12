//
//  RPCClient.swift
//  pi
//
//  RPC client using SubprocessTransport from PiCore
//

import Foundation
import PiCore

// MARK: - RPC Client Errors

enum RPCClientError: Error, LocalizedError {
    case notRunning
    case processTerminated(exitCode: Int32)
    case encodingFailed
    case decodingFailed(String)
    case requestTimeout
    case requestCancelled
    case invalidResponse(String)
    case serverError(RPCError)
    case pipeBroken
    case alreadyRunning
    case noModelsAvailable
    case transportError(RPCTransportError)

    var errorDescription: String? {
        switch self {
        case .notRunning:
            return "RPC client is not running"
        case .processTerminated(let code):
            return "Process terminated with exit code \(code)"
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
        case .pipeBroken:
            return "Communication pipe is broken"
        case .alreadyRunning:
            return "RPC client is already running"
        case .noModelsAvailable:
            return "No API keys configured"
        case .transportError(let error):
            return error.localizedDescription
        }
    }

    /// Whether this error requires authentication setup
    var requiresAuthSetup: Bool {
        switch self {
        case .noModelsAvailable:
            return true
        default:
            return false
        }
    }

    /// Create from transport error
    static func from(_ error: RPCTransportError) -> RPCClientError {
        switch error {
        case .notConnected:
            return .notRunning
        case .connectionFailed(let reason):
            if reason.contains("No models") {
                return .noModelsAvailable
            }
            return .transportError(error)
        case .connectionLost:
            return .pipeBroken
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

/// Actor-based RPC client that uses SubprocessTransport from PiCore
actor RPCClient {
    // MARK: - Properties

    private var transport: SubprocessTransport?
    private var eventTask: Task<Void, Never>?

    private var eventsContinuation: AsyncStream<RPCEvent>.Continuation?
    private var _events: AsyncStream<RPCEvent>?

    private var _isRunning = false

    private let executablePath: String
    private let environment: [String: String]?

    // MARK: - Initialization

    init(
        executablePath: String? = nil,
        environment: [String: String]? = nil
    ) {
        self.executablePath = executablePath ?? RPCClient.defaultExecutablePath
        self.environment = environment
    }

    deinit {
        eventTask?.cancel()
    }

    // MARK: - Public Interface

    /// Stream of events from the RPC server
    var events: AsyncStream<RPCEvent> {
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

    /// Whether the client is currently running
    var running: Bool {
        _isRunning
    }

    /// Start the RPC subprocess
    /// - Parameters:
    ///   - workingDirectory: Directory where pi should run (the project directory)
    func start(workingDirectory: String) async throws {
        guard !_isRunning else {
            throw RPCClientError.alreadyRunning
        }

        // Build environment with PI_CODING_AGENT_DIR
        var env: [String: String] = ["PI_CODING_AGENT_DIR": AppPaths.agentPath]
        if let customEnv = environment {
            for (key, value) in customEnv {
                env[key] = value
            }
        }

        let config = RPCTransportConfig.local(
            workingDirectory: workingDirectory,
            executablePath: executablePath,
            environment: env
        )

        let newTransport = SubprocessTransport(config: config)
        transport = newTransport

        do {
            try await newTransport.connect()
            _isRunning = await newTransport.isConnected

            if !_isRunning {
                transport = nil
                throw RPCClientError.notRunning
            }

            // Start forwarding events from transport to our event stream
            startEventForwarding()

        } catch let error as RPCTransportError {
            transport = nil
            _isRunning = false

            // Check for "No models available" in the error message
            if case .connectionFailed(let reason) = error,
               reason.contains("No models") || reason.contains("terminated immediately") {
                throw RPCClientError.noModelsAvailable
            }
            throw RPCClientError.from(error)
        }
    }

    /// Stop the RPC subprocess
    func stop() async {
        guard _isRunning else { return }

        _isRunning = false
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

    /// Send a command and wait for response
    func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R {
        guard _isRunning, let transport else {
            throw RPCClientError.notRunning
        }

        do {
            return try await transport.send(command)
        } catch let error as RPCTransportError {
            // Check if transport disconnected
            let stillConnected = await transport.isConnected
            if !stillConnected {
                _isRunning = false
            }
            throw RPCClientError.from(error)
        }
    }

    /// Send a command that returns no data (void response)
    func send<C: RPCCommand>(_ command: C) async throws {
        guard _isRunning, let transport else {
            throw RPCClientError.notRunning
        }

        do {
            try await transport.sendVoid(command)
        } catch let error as RPCTransportError {
            let stillConnected = await transport.isConnected
            if !stillConnected {
                _isRunning = false
            }
            throw RPCClientError.from(error)
        }
    }

    /// Send a prompt to the agent
    func prompt(_ message: String) async throws {
        let command = PromptCommand(message: message)
        try await send(command) as Void
    }

    /// Abort ongoing operation
    func abort() async throws {
        let command = AbortCommand()
        try await send(command) as Void
    }

    /// Get current state
    func getState() async throws -> GetStateResponse {
        let command = GetStateCommand()
        return try await send(command)
    }

    /// Get available models
    func getAvailableModels() async throws -> GetAvailableModelsResponse {
        let command = GetAvailableModelsCommand()
        return try await send(command)
    }

    /// Set the active model
    func setModel(provider: String, modelId: String) async throws {
        let command = SetModelCommand(provider: provider, modelId: modelId)
        try await send(command) as Void
    }

    /// Get conversation history
    func getMessages() async throws -> GetMessagesResponse {
        let command = GetMessagesCommand()
        return try await send(command)
    }

    /// Clear conversation
    func clearConversation() async throws {
        let command = ClearConversationCommand()
        try await send(command) as Void
    }

    /// Start a new session
    func newSession() async throws -> NewSessionResponse {
        let command = NewSessionCommand()
        return try await send(command)
    }

    /// Switch to an existing session file
    func switchSession(sessionPath: String) async throws -> SwitchSessionResponse {
        let command = SwitchSessionCommand(sessionPath: sessionPath)
        return try await send(command)
    }

    // MARK: - Private Methods

    private func startEventForwarding() {
        guard let transport else { return }

        eventTask = Task { [weak self] in
            let eventStream = await transport.events

            for await transportEvent in eventStream {
                guard let self, !Task.isCancelled else { break }

                // Forward the event (TransportEvent contains RPCEvent)
                await self.forwardEvent(transportEvent.event)
            }

            // Transport event stream ended - mark as not running
            if let self {
                await self.handleTransportDisconnect()
            }
        }
    }

    private func forwardEvent(_ event: RPCEvent) {
        eventsContinuation?.yield(event)
    }

    private func handleTransportDisconnect() {
        guard _isRunning else { return }

        _isRunning = false

        // Signal end with an error event
        eventsContinuation?.yield(.agentEnd(
            success: false,
            error: RPCError(
                code: "transport_disconnect",
                message: "Transport disconnected",
                details: nil
            )
        ))
        eventsContinuation?.finish()
    }
}

// MARK: - Convenience Extensions

extension RPCClient {
    /// Default path to the pi executable (from Application Support)
    nonisolated static var defaultExecutablePath: String {
        AppPaths.piExecutablePath
    }

    /// Create a client configured for development
    nonisolated static func development() -> RPCClient {
        RPCClient(
            executablePath: defaultExecutablePath,
            environment: ["PI_ENV": "development"]
        )
    }

    /// Create a client with custom executable path
    nonisolated static func withExecutable(_ path: String) -> RPCClient {
        RPCClient(executablePath: path)
    }
}
