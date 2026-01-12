//
//  TransportTests.swift
//  PiCoreTests
//
//  Tests for the transport layer types and logic
//

import Testing
import Foundation
@testable import PiCore

// MARK: - WSRequest Encoding Tests

@Test func wsRequestEncodingBasic() async throws {
    let request = WSRequest(
        id: "test-123",
        sessionId: "session-abc",
        method: "prompt",
        params: nil
    )

    let encoder = JSONEncoder()
    let data = try encoder.encode(request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    #expect(json["v"] as? Int == piProtocolVersion)
    #expect(json["kind"] as? String == "request")
    #expect(json["id"] as? String == "test-123")
    #expect(json["sessionId"] as? String == "session-abc")
    #expect(json["method"] as? String == "prompt")
}

@Test func wsRequestEncodingWithParams() async throws {
    // Use a dictionary for params since AnyCodable wraps arbitrary values
    let params: [String: Any] = ["message": "Hello world", "type": "prompt"]
    let request = WSRequest(
        id: "test-456",
        sessionId: nil,
        method: "prompt",
        params: AnyCodable(params)
    )

    let encoder = JSONEncoder()
    let data = try encoder.encode(request)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    #expect(json["v"] as? Int == piProtocolVersion)
    #expect(json["kind"] as? String == "request")
    #expect(json["id"] as? String == "test-456")
    #expect(json["sessionId"] == nil || json["sessionId"] is NSNull)
    #expect(json["method"] as? String == "prompt")

    // Params should be encoded
    let paramsDict = json["params"] as? [String: Any]
    #expect(paramsDict != nil)
    #expect(paramsDict?["message"] as? String == "Hello world")
}

// MARK: - WSResponse Decoding Tests

@Test func wsResponseDecodingSuccess() async throws {
    let json = """
    {
        "v": 1,
        "kind": "response",
        "id": "req-123",
        "sessionId": "sess-abc",
        "ok": true,
        "result": {"connectionId": "conn-xyz"}
    }
    """

    let decoder = JSONDecoder()
    let response = try decoder.decode(WSResponse.self, from: json.data(using: .utf8)!)

    #expect(response.v == 1)
    #expect(response.kind == .response)
    #expect(response.id == "req-123")
    #expect(response.sessionId == "sess-abc")
    #expect(response.ok == true)
    #expect(response.error == nil)
    #expect(response.result != nil)
}

@Test func wsResponseDecodingError() async throws {
    let json = """
    {
        "v": 1,
        "kind": "response",
        "id": "req-456",
        "ok": false,
        "error": {"message": "Something went wrong", "code": "ERR_001"}
    }
    """

    let decoder = JSONDecoder()
    let response = try decoder.decode(WSResponse.self, from: json.data(using: .utf8)!)

    #expect(response.ok == false)
    #expect(response.error?.message == "Something went wrong")
    #expect(response.error?.code == "ERR_001")
    #expect(response.result == nil)
}

// MARK: - WSEvent Decoding Tests

@Test func wsEventDecoding() async throws {
    let json = """
    {
        "v": 1,
        "kind": "event",
        "sessionId": "sess-123",
        "seq": 42,
        "type": "message_update",
        "payload": {"delta": "Hello"}
    }
    """

    let decoder = JSONDecoder()
    let event = try decoder.decode(WSEvent.self, from: json.data(using: .utf8)!)

    #expect(event.v == 1)
    #expect(event.kind == .event)
    #expect(event.sessionId == "sess-123")
    #expect(event.seq == 42)
    #expect(event.type == "message_update")
    #expect(event.payload != nil)
}

// MARK: - WSIncomingMessage Parsing Tests

@Test func wsIncomingMessageParsingResponse() async throws {
    let json = """
    {
        "v": 1,
        "kind": "response",
        "id": "req-789",
        "ok": true,
        "result": {}
    }
    """

    let decoder = JSONDecoder()
    let message = try decoder.decode(WSIncomingMessage.self, from: json.data(using: .utf8)!)

    #expect(message.kind == .response)
    #expect(message.id == "req-789")
    #expect(message.ok == true)
}

@Test func wsIncomingMessageParsingEvent() async throws {
    let json = """
    {
        "v": 1,
        "kind": "event",
        "sessionId": "sess-abc",
        "seq": 100,
        "type": "agent_start"
    }
    """

    let decoder = JSONDecoder()
    let message = try decoder.decode(WSIncomingMessage.self, from: json.data(using: .utf8)!)

    #expect(message.kind == .event)
    #expect(message.sessionId == "sess-abc")
    #expect(message.seq == 100)
    #expect(message.type == "agent_start")
}

// MARK: - Hello Types Tests

@Test func helloParamsEncoding() async throws {
    let params = HelloParams(
        client: ClientInfo(name: "pi-ios", version: "1.0.0"),
        resume: nil
    )

    let encoder = JSONEncoder()
    let data = try encoder.encode(params)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    let client = json["client"] as? [String: Any]
    #expect(client?["name"] as? String == "pi-ios")
    #expect(client?["version"] as? String == "1.0.0")
}

@Test func helloParamsWithResumeEncoding() async throws {
    let params = HelloParams(
        client: ClientInfo(name: "pi-macos", version: "2.0.0"),
        resume: ResumeInfo(
            connectionId: "conn-old",
            lastSeqBySession: ["sess-1": 42, "sess-2": 100]
        )
    )

    let encoder = JSONEncoder()
    let data = try encoder.encode(params)
    let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

    let resume = json["resume"] as? [String: Any]
    #expect(resume?["connectionId"] as? String == "conn-old")

    let seqs = resume?["lastSeqBySession"] as? [String: Any]
    #expect(seqs?["sess-1"] as? Int == 42)
    #expect(seqs?["sess-2"] as? Int == 100)
}

@Test func helloResultDecoding() async throws {
    let json = """
    {
        "connectionId": "conn-new-123",
        "server": {"name": "pi-server", "version": "1.0.0"},
        "capabilities": {"resume": true, "replayWindowSec": 300}
    }
    """

    let decoder = JSONDecoder()
    let result = try decoder.decode(HelloResult.self, from: json.data(using: .utf8)!)

    #expect(result.connectionId == "conn-new-123")
    #expect(result.server.name == "pi-server")
    #expect(result.server.version == "1.0.0")
    #expect(result.capabilities.resume == true)
    #expect(result.capabilities.replayWindowSec == 300)
}

// MARK: - Session Types Tests

@Test func sessionCreateResultDecoding() async throws {
    let json = """
    {"sessionId": "new-session-xyz"}
    """

    let decoder = JSONDecoder()
    let result = try decoder.decode(SessionCreateResult.self, from: json.data(using: .utf8)!)

    #expect(result.sessionId == "new-session-xyz")
}

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
    #expect(config.serverURL == nil)
}

@Test func transportConfigRemote() async throws {
    let url = URL(string: "ws://localhost:8080")!
    let config = RPCTransportConfig.remote(
        url: url,
        clientInfo: ClientInfo(name: "test-client", version: "1.0")
    )

    #expect(config.serverURL == url)
    #expect(config.clientInfo.name == "test-client")
    #expect(config.clientInfo.version == "1.0")
    #expect(config.workingDirectory == nil)
    #expect(config.executablePath == nil)
}

// MARK: - ConnectionState Tests

@Test func connectionStateInitial() async throws {
    let state = ConnectionState()

    #expect(await state.state == .disconnected)
    #expect(await state.isConnected == false)
    #expect(await state.isReconnecting == false)
}

@Test func connectionStateTransitions() async throws {
    let state = ConnectionState()

    await state.setState(.connecting)
    #expect(await state.state == .connecting)
    #expect(await state.isConnected == false)

    await state.setState(.connected)
    #expect(await state.state == .connected)
    #expect(await state.isConnected == true)

    await state.setState(.reconnecting(attempt: 1))
    #expect(await state.isReconnecting == true)
    #expect(await state.isConnected == false)
}

@Test func connectionStateReconnectLogic() async throws {
    let state = ConnectionState(maxReconnectAttempts: 3)

    #expect(await state.shouldAttemptReconnect(currentAttempt: 0) == true)
    #expect(await state.shouldAttemptReconnect(currentAttempt: 2) == true)
    #expect(await state.shouldAttemptReconnect(currentAttempt: 3) == false)
}

@Test func connectionStateReconnectDelay() async throws {
    let state = ConnectionState(baseReconnectDelay: 1.0, maxReconnectDelay: 10.0)

    // Delay should increase exponentially but be capped
    let delay0 = await state.reconnectDelay(attempt: 0)
    let delay1 = await state.reconnectDelay(attempt: 1)
    let delay2 = await state.reconnectDelay(attempt: 2)
    let delay5 = await state.reconnectDelay(attempt: 5)

    // Base delay is ~1s for attempt 0, ~2s for attempt 1, ~4s for attempt 2
    // (with jitter, so we check ranges)
    #expect(delay0 >= 1.0 && delay0 <= 1.5)
    #expect(delay1 >= 2.0 && delay1 <= 3.0)
    #expect(delay2 >= 4.0 && delay2 <= 6.0)

    // Should be capped at maxReconnectDelay
    #expect(delay5 <= 10.0)
}

// MARK: - RPCConnection Tests

@Test func rpcConnectionResumeInfo() async throws {
    let connection = RPCConnection()

    // Initially no resume info
    var resumeInfo = await connection.getResumeInfo()
    #expect(resumeInfo == nil)

    // After setting connection info
    await connection.setConnectionInfo(
        connectionId: "conn-123",
        capabilities: ServerCapabilities(resume: true, replayWindowSec: 300)
    )

    resumeInfo = await connection.getResumeInfo()
    #expect(resumeInfo?.connectionId == "conn-123")
    #expect(resumeInfo?.lastSeqBySession.isEmpty == true)
}

@Test func rpcConnectionReset() async throws {
    let connection = RPCConnection()

    await connection.setConnectionInfo(
        connectionId: "conn-456",
        capabilities: ServerCapabilities(resume: true, replayWindowSec: nil)
    )

    #expect(await connection.connectionId == "conn-456")

    await connection.reset()

    #expect(await connection.connectionId == nil)
    #expect(await connection.capabilities == nil)
}

// MARK: - RPCTransportError Tests

@Test func transportErrorDescriptions() async throws {
    #expect(RPCTransportError.notConnected.errorDescription == "Not connected to RPC server")
    #expect(RPCTransportError.connectionFailed("test").errorDescription == "Connection failed: test")
    #expect(RPCTransportError.timeout.errorDescription == "Request timed out")

    let rpcError = RPCError(code: "E001", message: "Server error", details: nil)
    #expect(RPCTransportError.serverError(rpcError).errorDescription == "Server error")
}
