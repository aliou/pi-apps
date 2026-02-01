//
//  RPCTransport.swift
//  PiCore
//
//  Abstraction for RPC communication via subprocess
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

/// Transport event with session context
public struct TransportEvent: Sendable {
    public let sessionId: String
    public let event: RPCEvent
    public let seq: UInt64?

    public init(sessionId: String, event: RPCEvent, seq: UInt64? = nil) {
        self.sessionId = sessionId
        self.event = event
        self.seq = seq
    }
}

/// Protocol for RPC transport implementations (subprocess-based)
public protocol RPCTransport: Sendable {
    /// Whether the transport is currently connected
    var isConnected: Bool { get async }

    /// Current connection ID (for resume)
    var connectionId: String? { get async }

    /// Stream of transport events (includes session context)
    var events: AsyncStream<TransportEvent> { get async }

    /// Connect to the RPC server
    func connect() async throws

    /// Disconnect from the RPC server
    func disconnect() async

    /// Send a request and wait for typed response
    func send<R: Decodable & Sendable>(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws -> R

    /// Send a request with no response data
    func sendVoid(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws

    // MARK: - Legacy Command Interface (for backwards compatibility)

    /// Send a command and wait for response (legacy interface)
    func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R

    /// Send a command that returns no data (legacy interface)
    func sendVoid<C: RPCCommand>(_ command: C) async throws
}

// MARK: - Default Legacy Implementation

extension RPCTransport {
    /// Default implementation of legacy send using new interface
    public func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R {
        try await send(method: command.type, sessionId: nil, params: command)
    }

    /// Default implementation of legacy sendVoid using new interface
    public func sendVoid<C: RPCCommand>(_ command: C) async throws {
        try await sendVoid(method: command.type, sessionId: nil, params: command)
    }
}

/// Configuration for subprocess transport
public struct RPCTransportConfig: Sendable {
    /// Working directory for the agent
    public let workingDirectory: String?

    /// Path to executable
    public let executablePath: String?

    /// Custom environment variables
    public let environment: [String: String]?

    public init(
        workingDirectory: String? = nil,
        executablePath: String? = nil,
        environment: [String: String]? = nil
    ) {
        self.workingDirectory = workingDirectory
        self.executablePath = executablePath
        self.environment = environment
    }

    /// Configuration for local subprocess
    public static func local(
        workingDirectory: String,
        executablePath: String,
        environment: [String: String]? = nil
    ) -> Self {
        Self(
            workingDirectory: workingDirectory,
            executablePath: executablePath,
            environment: environment
        )
    }
}
