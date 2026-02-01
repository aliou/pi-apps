//
//  RemoteAgentConnection.swift
//  PiCore
//
//  Remote agent connection via relay server
//

import Foundation
import Observation

/// Remote agent connection via relay server
@MainActor
@Observable
public final class RemoteAgentConnection: AgentConnection {
    public let baseURL: URL
    public let sessionId: String

    private var transport: RelaySessionTransport?
    private var eventTask: Task<Void, Never>?
    private var eventSubscribers: [UUID: AsyncStream<RPCEvent>.Continuation] = [:]

    public private(set) var isConnected = false

    public init(baseURL: URL, sessionId: String) {
        self.baseURL = baseURL
        self.sessionId = sessionId
    }

    public func connect() async throws {
        let newTransport = RelaySessionTransport(baseURL: baseURL, sessionId: sessionId)
        transport = newTransport

        try await newTransport.connect()
        isConnected = await newTransport.isConnected

        if !isConnected {
            transport = nil
            throw AgentConnectionError.connectionFailed("WebSocket connection failed")
        }

        startEventForwarding()
    }

    public func disconnect() async {
        isConnected = false
        eventTask?.cancel()

        if let t = transport {
            await t.disconnect()
        }
        transport = nil

        for continuation in eventSubscribers.values {
            continuation.finish()
        }
        eventSubscribers.removeAll()
    }

    public func subscribe() -> AsyncStream<RPCEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            self.eventSubscribers[id] = continuation
            continuation.onTermination = { @Sendable _ in
                Task { @MainActor in
                    self.eventSubscribers.removeValue(forKey: id)
                }
            }
        }
    }

    // MARK: - Commands

    public func prompt(_ message: String, streamingBehavior: StreamingBehavior?) async throws {
        guard let transport else { throw AgentConnectionError.notConnected }
        try await transport.prompt(message: message, streamingBehavior: streamingBehavior?.rawValue)
    }

    public func abort() async throws {
        guard let transport else { throw AgentConnectionError.notConnected }
        try await transport.abort()
    }

    public func getState() async throws -> GetStateResponse {
        guard let transport else { throw AgentConnectionError.notConnected }
        return try await transport.getState()
    }

    public func getAvailableModels() async throws -> GetAvailableModelsResponse {
        guard let transport else { throw AgentConnectionError.notConnected }
        return try await transport.getAvailableModels()
    }

    public func setModel(provider: String, modelId: String) async throws {
        guard let transport else { throw AgentConnectionError.notConnected }
        try await transport.setModel(provider: provider, modelId: modelId)
    }

    public func getMessages() async throws -> GetMessagesResponse {
        guard let transport else { throw AgentConnectionError.notConnected }
        return try await transport.getMessages()
    }

    // MARK: - Event Forwarding

    private func startEventForwarding() {
        guard let transport else { return }

        eventTask = Task { [weak self] in
            let events = await transport.events

            for await relayEvent in events {
                guard let self, !Task.isCancelled else { break }

                switch relayEvent {
                case .relay(let serverEvent):
                    self.handleRelayEvent(serverEvent)
                case .pi(let rpcEvent):
                    self.handlePiEvent(rpcEvent)
                }
            }

            // Transport disconnected
            if let self, self.isConnected {
                await MainActor.run {
                    self.isConnected = false
                    self.broadcastEvent(.agentEnd(success: false, error: RPCError(
                        code: "transport_disconnect",
                        message: "Connection lost",
                        details: nil
                    )))
                }
            }
        }
    }

    private func handleRelayEvent(_ event: RelayServerEvent) {
        switch event {
        case .connected(let sid, let lastSeq):
            print("[RemoteAgentConnection] Connected to session \(sid), lastSeq: \(lastSeq)")
        case .replayStart(let from, let to):
            print("[RemoteAgentConnection] Replay starting: \(from) -> \(to)")
        case .replayEnd:
            print("[RemoteAgentConnection] Replay complete")
        case .sandboxStatus(let status, let message):
            print("[RemoteAgentConnection] Sandbox status: \(status), message: \(message ?? "")")
        case .error(let code, let message):
            print("[RemoteAgentConnection] Relay error: \(code) - \(message)")
            broadcastEvent(.agentEnd(success: false, error: RPCError(
                code: code,
                message: message,
                details: nil
            )))
        }
    }

    private func handlePiEvent(_ event: RPCEvent) {
        broadcastEvent(event)
    }

    private func broadcastEvent(_ event: RPCEvent) {
        for continuation in eventSubscribers.values {
            continuation.yield(event)
        }
    }
}
