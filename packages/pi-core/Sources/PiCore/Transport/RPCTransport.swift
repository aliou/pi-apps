//
//  RPCTransport.swift
//  PiCore
//
//  Abstraction for RPC communication - local subprocess or remote server
//

import Foundation

/// Errors that can occur during RPC transport
public enum RPCTransportError: Error, LocalizedError, Sendable {
    case notConnected
    case connectionFailed(String)
    case connectionLost(String)
    case encodingFailed
    case decodingFailed(String)
    case timeout
    case cancelled
    case invalidResponse(String)
    case serverError(RPCError)

    public var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Not connected to RPC server"
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        case .connectionLost(let reason):
            return "Connection lost: \(reason)"
        case .encodingFailed:
            return "Failed to encode command"
        case .decodingFailed(let details):
            return "Failed to decode response: \(details)"
        case .timeout:
            return "Request timed out"
        case .cancelled:
            return "Request was cancelled"
        case .invalidResponse(let details):
            return "Invalid response: \(details)"
        case .serverError(let error):
            return error.message
        }
    }
}

/// Protocol for RPC transport implementations
public protocol RPCTransport: Sendable {
    /// Whether the transport is currently connected
    var isConnected: Bool { get async }

    /// Stream of events from the RPC server
    var events: AsyncStream<RPCEvent> { get async }

    /// Connect to the RPC server
    func connect() async throws

    /// Disconnect from the RPC server
    func disconnect() async

    /// Send a command and wait for response
    func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R

    /// Send a command that returns no data (void response)
    func sendVoid<C: RPCCommand>(_ command: C) async throws
}

/// Configuration for transport connections
public struct RPCTransportConfig: Sendable {
    /// Working directory for the agent (used by local transport)
    public let workingDirectory: String?

    /// Remote server URL (used by remote transport)
    public let serverURL: URL?

    /// Authentication token (used by remote transport)
    public let authToken: String?

    /// Custom environment variables
    public let environment: [String: String]?

    public init(
        workingDirectory: String? = nil,
        serverURL: URL? = nil,
        authToken: String? = nil,
        environment: [String: String]? = nil
    ) {
        self.workingDirectory = workingDirectory
        self.serverURL = serverURL
        self.authToken = authToken
        self.environment = environment
    }

    /// Configuration for local subprocess
    public static func local(workingDirectory: String, environment: [String: String]? = nil) -> Self {
        Self(workingDirectory: workingDirectory, environment: environment)
    }

    /// Configuration for remote server
    public static func remote(url: URL, authToken: String? = nil) -> Self {
        Self(serverURL: url, authToken: authToken)
    }
}
