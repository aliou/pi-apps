//
//  NativeToolTypes.swift
//  PiCore
//
//  Types for native tool registration and execution
//

import Foundation

/// Definition of a native tool capability.
/// Sent by client in hello handshake.
/// Uses same structure as regular pi tools.
public struct NativeToolDefinition: Codable, Sendable {
    public let name: String
    public let description: String
    public let parameters: [String: AnyCodable]

    public init(
        name: String,
        description: String,
        parameters: [String: AnyCodable] = [
            "type": AnyCodable("object"),
            "properties": AnyCodable([String: Any]())
        ]
    ) {
        self.name = name
        self.description = description
        self.parameters = parameters
    }
}

/// Request from server to execute a native tool.
/// Received as event payload.
public struct NativeToolRequest: Sendable {
    public let callId: String
    public let toolName: String
    public let args: [String: AnyCodable]

    public init(callId: String, toolName: String, args: [String: AnyCodable]) {
        self.callId = callId
        self.toolName = toolName
        self.args = args
    }
}

/// Response params for native_tool_response RPC.
public struct NativeToolResponseParams: Encodable, Sendable {
    public let callId: String
    public let result: AnyCodable?
    public let error: NativeToolErrorInfo?

    public init(callId: String, result: Any? = nil, error: NativeToolErrorInfo? = nil) {
        self.callId = callId
        self.result = result.map { AnyCodable($0) }
        self.error = error
    }
}

public struct NativeToolErrorInfo: Codable, Sendable {
    public let message: String

    public init(message: String) {
        self.message = message
    }
}
