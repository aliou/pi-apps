//
//  TransportTests.swift
//  PiCoreTests
//
//  Tests for the transport layer types and logic
//

import Testing
import Foundation
@testable import PiCore

// MARK: - TransportEvent Tests

@Test func transportEventCreation() async throws {
    let event = TransportEvent(
        sessionId: "test-session",
        event: .agentStart,
        seq: 1
    )

    #expect(event.sessionId == "test-session")
    #expect(event.seq == 1)

    if case .agentStart = event.event {
        // Expected
    } else {
        Issue.record("Expected agentStart event")
    }
}

// MARK: - RPCTransportConfig Tests

@Test func transportConfigLocal() async throws {
    let config = RPCTransportConfig.local(
        workingDirectory: "/tmp/test",
        executablePath: "/usr/local/bin/pi",
        environment: ["PI_DEBUG": "1"]
    )

    #expect(config.workingDirectory == "/tmp/test")
    #expect(config.executablePath == "/usr/local/bin/pi")
    #expect(config.environment?["PI_DEBUG"] == "1")
}

// MARK: - RPCTransportError Tests

@Test func transportErrorDescriptions() async throws {
    #expect(RPCTransportError.notConnected.errorDescription == "Not connected to RPC server")
    #expect(RPCTransportError.connectionFailed("test").errorDescription == "Connection failed: test")
    #expect(RPCTransportError.timeout.errorDescription == "Request timed out")

    let rpcError = RPCError(code: "E001", message: "Server error", details: nil)
    #expect(RPCTransportError.serverError(rpcError).errorDescription == "Server error")
}

// MARK: - RPCConnection Tests

@Test func rpcConnectionReset() async throws {
    let connection = RPCConnection()
    // After reset, events stream should still be accessible
    await connection.reset()
    _ = await connection.events
}

// MARK: - SessionCreateResult Tests

@Test func sessionCreateResultDecoding() async throws {
    let json = """
    {"sessionId": "new-session-xyz"}
    """

    let decoder = JSONDecoder()
    let result = try decoder.decode(SessionCreateResult.self, from: json.data(using: .utf8)!)

    #expect(result.sessionId == "new-session-xyz")
}

// MARK: - SessionListResult Tests

@Test func sessionListResultDecoding() async throws {
    let json = """
    {
        "sessions": [
            {"sessionId": "sess-1", "createdAt": "2025-01-12T10:00:00Z"},
            {"sessionId": "sess-2", "lastActivityAt": "2025-01-12T11:00:00Z"}
        ]
    }
    """

    let decoder = JSONDecoder()
    let result = try decoder.decode(SessionListResult.self, from: json.data(using: .utf8)!)

    #expect(result.sessions.count == 2)
    #expect(result.sessions[0].sessionId == "sess-1")
    #expect(result.sessions[0].createdAt == "2025-01-12T10:00:00Z")
    #expect(result.sessions[1].sessionId == "sess-2")
    #expect(result.sessions[1].lastActivityAt == "2025-01-12T11:00:00Z")
}
