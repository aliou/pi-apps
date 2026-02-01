//
//  AgentConnection.swift
//  PiCore
//
//  Unified interface for agent connections (local subprocess or remote relay)
//

import Foundation

/// Unified interface for agent connections (local subprocess or remote relay)
@MainActor
public protocol AgentConnection: AnyObject, Sendable {
    /// Whether the connection is active
    var isConnected: Bool { get }

    /// Connect to the agent
    func connect() async throws

    /// Disconnect from the agent
    func disconnect() async

    /// Subscribe to events
    func subscribe() -> AsyncStream<RPCEvent>

    // MARK: - Commands

    /// Send a prompt to the agent
    func prompt(_ message: String, streamingBehavior: StreamingBehavior?) async throws

    /// Abort the current operation
    func abort() async throws

    /// Get current agent state
    func getState() async throws -> GetStateResponse

    /// Get available models
    func getAvailableModels() async throws -> GetAvailableModelsResponse

    /// Set the active model
    func setModel(provider: String, modelId: String) async throws

    /// Get conversation messages
    func getMessages() async throws -> GetMessagesResponse
}

/// Errors for agent connections
public enum AgentConnectionError: Error, LocalizedError, Sendable {
    case notConnected
    case connectionFailed(String)
    case connectionLost(String)
    case commandFailed(String)
    case invalidResponse(String)
    case timeout
    case cancelled
    case serverError(RPCError)

    public var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected"
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        case .connectionLost(let reason):
            return "Connection lost: \(reason)"
        case .commandFailed(let reason):
            return "Command failed: \(reason)"
        case .invalidResponse(let reason):
            return "Invalid response: \(reason)"
        case .timeout:
            return "Request timed out"
        case .cancelled:
            return "Request was cancelled"
        case .serverError(let error):
            return error.message
        }
    }

    /// Convert from RPCTransportError
    public static func from(_ error: RPCTransportError) -> Self {
        switch error {
        case .notConnected:
            return .notConnected
        case .connectionFailed(let reason):
            return .connectionFailed(reason)
        case .connectionLost(let reason):
            return .connectionLost(reason)
        case .encodingFailed:
            return .commandFailed("Failed to encode command")
        case .decodingFailed(let details):
            return .invalidResponse(details)
        case .timeout:
            return .timeout
        case .cancelled:
            return .cancelled
        case .invalidResponse(let details):
            return .invalidResponse(details)
        case .serverError(let rpcError):
            return .serverError(rpcError)
        }
    }
}
