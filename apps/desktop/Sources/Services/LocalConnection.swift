//
//  LocalConnection.swift
//  pi
//
//  Connection to a local pi subprocess
//

import Foundation
import PiCore

/// Connection to a local pi subprocess
@MainActor
@Observable
final class LocalConnection: PiConnection, @unchecked Sendable {
    private(set) var isConnected = false

    private let workingDirectory: String
    private var transport: SubprocessTransport?
    private var eventTask: Task<Void, Never>?
    private var eventsContinuation: AsyncStream<RPCEvent>.Continuation?

    init(workingDirectory: String) {
        self.workingDirectory = workingDirectory
    }

    func connect() async throws {
        guard !isConnected else { return }

        // Build environment with PI_CODING_AGENT_DIR
        let env = ["PI_CODING_AGENT_DIR": AppPaths.agentPath]

        let config = RPCTransportConfig.local(
            workingDirectory: workingDirectory,
            executablePath: AppPaths.piExecutablePath,
            environment: env
        )

        let newTransport = SubprocessTransport(config: config)
        transport = newTransport

        try await newTransport.connect()
        isConnected = await newTransport.isConnected

        if !isConnected {
            transport = nil
            throw LocalConnectionError.failedToStart
        }
    }

    func disconnect() async {
        isConnected = false
        eventTask?.cancel()
        eventTask = nil

        if let t = transport {
            await t.disconnect()
        }
        transport = nil

        eventsContinuation?.finish()
        eventsContinuation = nil
    }

    func subscribe() -> AsyncStream<RPCEvent> {
        let (stream, continuation) = AsyncStream<RPCEvent>.makeStream(
            bufferingPolicy: .bufferingNewest(100)
        )
        self.eventsContinuation = continuation

        // Start forwarding events from transport
        eventTask?.cancel()
        eventTask = Task { [weak self] in
            guard let self, let transport else { return }

            let eventStream = await transport.events

            for await transportEvent in eventStream {
                guard !Task.isCancelled else { break }
                continuation.yield(transportEvent.event)
            }

            // Transport disconnected
            await self.handleTransportDisconnect()
        }

        return stream
    }

    func prompt(_ message: String, streamingBehavior: StreamingBehavior?) async throws {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = PromptCommand(message: message, streamingBehavior: streamingBehavior)
        try await transport.sendVoid(method: command.type, sessionId: nil, params: command)
    }

    func abort() async throws {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = AbortCommand()
        try await transport.sendVoid(method: command.type, sessionId: nil, params: command)
    }

    func getAvailableModels() async throws -> GetAvailableModelsResponse {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = GetAvailableModelsCommand()
        return try await transport.send(method: command.type, sessionId: nil, params: command)
    }

    func setModel(provider: String, modelId: String) async throws {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = SetModelCommand(provider: provider, modelId: modelId)
        try await transport.sendVoid(method: command.type, sessionId: nil, params: command)
    }

    func getState() async throws -> GetStateResponse {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = GetStateCommand()
        return try await transport.send(method: command.type, sessionId: nil, params: command)
    }

    // MARK: - Session Management (local subprocess specific)

    func newSession() async throws -> NewSessionResponse {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = NewSessionCommand()
        return try await transport.send(method: command.type, sessionId: nil, params: command)
    }

    func switchSession(sessionPath: String) async throws -> SwitchSessionResponse {
        guard isConnected, let transport else {
            throw LocalConnectionError.notConnected
        }

        let command = SwitchSessionCommand(sessionPath: sessionPath)
        return try await transport.send(method: command.type, sessionId: nil, params: command)
    }

    // MARK: - Private

    private func handleTransportDisconnect() async {
        guard isConnected else { return }

        isConnected = false
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

// MARK: - Errors

enum LocalConnectionError: Error, LocalizedError {
    case notConnected
    case failedToStart
    case noModelsAvailable

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to local pi process"
        case .failedToStart:
            return "Failed to start pi process"
        case .noModelsAvailable:
            return "No API keys configured"
        }
    }
}
