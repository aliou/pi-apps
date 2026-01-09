//
//  RPCTypes.swift
//  pi
//
//  Created by Aliou Diallo on 2026-01-07.
//

import Foundation

// MARK: - RPC Commands

/// Base protocol for all RPC commands
@preconcurrency
protocol RPCCommand: Encodable, Sendable {
    var type: String { get }
}

/// Prompt command - send a message to the agent
struct PromptCommand: RPCCommand, Sendable {
    let type = "prompt"
    let message: String
    let customSystemPrompt: String?
    let allowedTools: [String]?
    let disallowedTools: [String]?
    let mcpConfigPaths: [String]?
    
    init(
        message: String,
        customSystemPrompt: String? = nil,
        allowedTools: [String]? = nil,
        disallowedTools: [String]? = nil,
        mcpConfigPaths: [String]? = nil
    ) {
        self.message = message
        self.customSystemPrompt = customSystemPrompt
        self.allowedTools = allowedTools
        self.disallowedTools = disallowedTools
        self.mcpConfigPaths = mcpConfigPaths
    }
}

/// Abort command - cancel ongoing operation
struct AbortCommand: RPCCommand, Sendable {
    let type = "abort"
}

/// Get current state
struct GetStateCommand: RPCCommand, Sendable {
    let type = "get_state"
}

/// Get available models
struct GetAvailableModelsCommand: RPCCommand, Sendable {
    let type = "get_available_models"
}

/// Set the active model
struct SetModelCommand: RPCCommand, Sendable {
    let type = "set_model"
    let provider: String
    let modelId: String
}

/// Get conversation history
struct GetMessagesCommand: RPCCommand, Sendable {
    let type = "get_messages"
}

/// Start a new session
struct NewSessionCommand: RPCCommand, Sendable {
    let type = "new_session"
}

/// Switch to an existing session
struct SwitchSessionCommand: RPCCommand, Sendable {
    let type = "switch_session"
    let sessionPath: String
}

/// Clear conversation
struct ClearConversationCommand: RPCCommand, Sendable {
    let type = "clear_conversation"
}

// MARK: - RPC Response

/// Generic RPC response wrapper
struct RPCResponse<T: Decodable & Sendable>: Decodable, Sendable {
    let type: String
    let command: String
    let success: Bool
    let data: T?
    let error: RPCError?
}

/// RPC error details
struct RPCError: Decodable, Error {
    let code: String?
    let message: String
    let details: String?
}

/// Raw response for initial parsing to determine routing
struct RawRPCMessage: Decodable, Sendable {
    let type: String
    
    // Response fields
    let command: String?
    let success: Bool?
    let data: AnyCodable?
    let error: RPCError?
    
    // Event fields (varies by event type)
    let message: RawMessage?
    let assistantMessageEvent: AssistantMessageEvent?
    let toolCallId: String?
    let toolName: String?
    let args: AnyCodable?
    let partialResult: ToolPartialResult?
    let result: ToolResult?
    let isError: Bool?
    let context: StateContext?
    let messages: [RawMessage]?
    let messageId: String?
    let stopReason: String?
    
    // auto_retry events
    let attempt: Int?
    let maxAttempts: Int?
    let delayMs: Int?
    let errorMessage: String?
    let finalError: String?
    
    // hook_error events
    let extensionPath: String?
    let event: String?
}

/// Raw message from RPC (simplified version)
struct RawMessage: Decodable, Sendable {
    let role: String?
    let content: AnyCodable?
}

/// Partial result from tool execution update
struct ToolPartialResult: Decodable, Sendable {
    let content: [ToolContent]?
    let details: AnyCodable?
}

/// Tool result from tool execution end
struct ToolResult: Decodable, Sendable {
    let content: [ToolContent]?
    let details: AnyCodable?
}

/// Content in tool results
struct ToolContent: Decodable, Sendable {
    let type: String
    let text: String?
}

// MARK: - Model

/// Represents an available AI model
struct Model: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let provider: String
    let contextWindow: Int?
    let maxOutputTokens: Int?
    let supportsImages: Bool?
    let supportsToolUse: Bool?
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(provider)
    }
    
    static func == (lhs: Model, rhs: Model) -> Bool {
        lhs.id == rhs.id && lhs.provider == rhs.provider
    }
}

// MARK: - State

/// Current agent state
struct StateContext: Codable, Sendable {
    let workingDirectory: String?
    let model: Model?
    let conversationId: String?
    let messageCount: Int?
    let isProcessing: Bool?
}

/// Response for get_state command
struct GetStateResponse: Decodable, Sendable {
    let model: Model?
    let thinkingLevel: String?
    let isStreaming: Bool?
    let isCompacting: Bool?
    let steeringMode: String?
    let followUpMode: String?
    let sessionFile: String?
    let sessionId: String?
    let autoCompactionEnabled: Bool?
    let messageCount: Int?
    let pendingMessageCount: Int?
}

/// Response for get_available_models command
struct GetAvailableModelsResponse: Decodable, Sendable {
    let models: [Model]
}

/// Response for prompt command
struct PromptResponse: Decodable, Sendable {
    let messageId: String?
}

// MARK: - Messages

/// A conversation message
struct Message: Codable, Identifiable, Sendable {
    let id: String
    let role: MessageRole
    let content: MessageContent?
    let timestamp: Date?
    let model: String?
    
    enum CodingKeys: String, CodingKey {
        case id, role, content, timestamp, model
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        role = try container.decode(MessageRole.self, forKey: .role)
        content = try container.decodeIfPresent(MessageContent.self, forKey: .content)
        model = try container.decodeIfPresent(String.self, forKey: .model)
        
        // Handle timestamp as ISO8601 string or nil
        if let timestampString = try container.decodeIfPresent(String.self, forKey: .timestamp) {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            timestamp = formatter.date(from: timestampString)
        } else {
            timestamp = nil
        }
    }
}

enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
    case system
    case tool
}

/// Message content - can be text or structured
enum MessageContent: Codable, Sendable {
    case text(String)
    case structured([ContentBlock])
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let text = try? container.decode(String.self) {
            self = .text(text)
        } else if let blocks = try? container.decode([ContentBlock].self) {
            self = .structured(blocks)
        } else {
            throw DecodingError.typeMismatch(
                MessageContent.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Expected String or [ContentBlock]"
                )
            )
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let text):
            try container.encode(text)
        case .structured(let blocks):
            try container.encode(blocks)
        }
    }
}

/// Content block within a message
struct ContentBlock: Codable, Sendable {
    let type: ContentBlockType
    let text: String?
    let thinking: String?
    let toolCallId: String?
    let toolName: String?
    let input: AnyCodable?
    let output: String?
}

enum ContentBlockType: String, Codable, Sendable {
    case text
    case thinking
    case toolUse = "tool_use"
    case toolResult = "tool_result"
}

// MARK: - RPC Events

/// All possible RPC events from the server
enum RPCEvent: Sendable {
    case agentStart
    case agentEnd(success: Bool, error: RPCError?)
    case turnStart
    case turnEnd
    case messageStart(messageId: String?)
    case messageEnd(stopReason: String?)
    case messageUpdate(message: RawMessage?, event: AssistantMessageEvent)
    case toolExecutionStart(toolCallId: String, toolName: String, args: AnyCodable?)
    case toolExecutionUpdate(toolCallId: String, output: String)
    case toolExecutionEnd(toolCallId: String, output: String?, status: ToolStatus)
    case autoCompactionStart
    case autoCompactionEnd
    case autoRetryStart(attempt: Int, maxAttempts: Int, delayMs: Int, errorMessage: String)
    case autoRetryEnd(success: Bool, attempt: Int, finalError: String?)
    case hookError(extensionPath: String?, event: String?, error: String?)
    case stateUpdate(context: StateContext)
    case unknown(type: String, raw: Data)
}

enum ToolStatus: String, Codable, Sendable {
    case success
    case error
    case cancelled
}

// MARK: - Assistant Message Events

/// Events for streaming assistant message updates
enum AssistantMessageEvent: Codable, Sendable {
    case textDelta(delta: String)
    case thinkingDelta(delta: String)
    case toolUseStart(toolCallId: String, toolName: String)
    case toolUseInputDelta(toolCallId: String, delta: String)
    case toolUseEnd(toolCallId: String)
    case messageStart(messageId: String)
    case messageEnd(stopReason: String?)
    case contentBlockStart(index: Int, blockType: ContentBlockType)
    case contentBlockEnd(index: Int)
    case unknown(type: String)
    
    enum CodingKeys: String, CodingKey {
        case type
        case delta
        case toolCallId
        case toolName
        case messageId
        case stopReason
        case index
        case blockType
        case contentIndex  // Present but unused
        case partial       // Present but unused
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        
        switch type {
        case "text_delta":
            let delta = try container.decodeIfPresent(String.self, forKey: .delta) ?? ""
            self = .textDelta(delta: delta)
            
        case "text_start", "text_end":
            // Start/end markers - treat as empty delta
            self = .textDelta(delta: "")
            
        case "thinking_delta":
            let delta = try container.decodeIfPresent(String.self, forKey: .delta) ?? ""
            self = .thinkingDelta(delta: delta)
            
        case "thinking_start", "thinking_end":
            // Start/end markers - treat as empty delta
            self = .thinkingDelta(delta: "")
            
        case "tool_use_start", "toolcall_start":
            let toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId) ?? ""
            let toolName = try container.decodeIfPresent(String.self, forKey: .toolName) ?? ""
            self = .toolUseStart(toolCallId: toolCallId, toolName: toolName)
            
        case "tool_use_input_delta", "toolcall_delta":
            let toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId) ?? ""
            let delta = try container.decodeIfPresent(String.self, forKey: .delta) ?? ""
            self = .toolUseInputDelta(toolCallId: toolCallId, delta: delta)
            
        case "tool_use_end", "toolcall_end":
            let toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId) ?? ""
            self = .toolUseEnd(toolCallId: toolCallId)
            
        case "message_start", "start":
            let messageId = try container.decodeIfPresent(String.self, forKey: .messageId) ?? ""
            self = .messageStart(messageId: messageId)
            
        case "message_end", "done":
            let stopReason = try container.decodeIfPresent(String.self, forKey: .stopReason)
            self = .messageEnd(stopReason: stopReason)
            
        case "content_block_start":
            let index = try container.decodeIfPresent(Int.self, forKey: .index) ?? 0
            let blockType = try container.decodeIfPresent(ContentBlockType.self, forKey: .blockType) ?? .text
            self = .contentBlockStart(index: index, blockType: blockType)
            
        case "content_block_end":
            let index = try container.decodeIfPresent(Int.self, forKey: .index) ?? 0
            self = .contentBlockEnd(index: index)
            
        case "error":
            // Error event - treat as message end with error
            self = .messageEnd(stopReason: "error")
            
        default:
            self = .unknown(type: type)
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        switch self {
        case .textDelta(let delta):
            try container.encode("text_delta", forKey: .type)
            try container.encode(delta, forKey: .delta)
            
        case .thinkingDelta(let delta):
            try container.encode("thinking_delta", forKey: .type)
            try container.encode(delta, forKey: .delta)
            
        case .toolUseStart(let toolCallId, let toolName):
            try container.encode("tool_use_start", forKey: .type)
            try container.encode(toolCallId, forKey: .toolCallId)
            try container.encode(toolName, forKey: .toolName)
            
        case .toolUseInputDelta(let toolCallId, let delta):
            try container.encode("tool_use_input_delta", forKey: .type)
            try container.encode(toolCallId, forKey: .toolCallId)
            try container.encode(delta, forKey: .delta)
            
        case .toolUseEnd(let toolCallId):
            try container.encode("tool_use_end", forKey: .type)
            try container.encode(toolCallId, forKey: .toolCallId)
            
        case .messageStart(let messageId):
            try container.encode("message_start", forKey: .type)
            try container.encode(messageId, forKey: .messageId)
            
        case .messageEnd(let stopReason):
            try container.encode("message_end", forKey: .type)
            try container.encodeIfPresent(stopReason, forKey: .stopReason)
            
        case .contentBlockStart(let index, let blockType):
            try container.encode("content_block_start", forKey: .type)
            try container.encode(index, forKey: .index)
            try container.encode(blockType, forKey: .blockType)
            
        case .contentBlockEnd(let index):
            try container.encode("content_block_end", forKey: .type)
            try container.encode(index, forKey: .index)
            
        case .unknown(let type):
            try container.encode(type, forKey: .type)
        }
    }
}

// MARK: - AnyCodable Helper

/// Type-erased Codable wrapper for dynamic JSON values
struct AnyCodable: Codable, @unchecked Sendable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.typeMismatch(
                AnyCodable.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Cannot decode AnyCodable"
                )
            )
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: encoder.codingPath,
                    debugDescription: "Cannot encode \(type(of: value))"
                )
            )
        }
    }
    
    /// Convert to JSON Data
    func toJSONData() throws -> Data {
        try JSONSerialization.data(withJSONObject: value)
    }
    
    /// Pretty-printed JSON string
    var jsonString: String? {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: .prettyPrinted) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: - Conversation Response

struct GetMessagesResponse: Decodable, Sendable {
    let messages: [Message]
}

struct NewSessionResponse: Decodable, Sendable {
    let cancelled: Bool
}

struct SwitchSessionResponse: Decodable, Sendable {
    let cancelled: Bool
}
