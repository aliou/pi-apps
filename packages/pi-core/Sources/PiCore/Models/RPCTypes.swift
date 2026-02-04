//
//  RPCTypes.swift
//  PiCore
//

import Foundation

// MARK: - Session Management Types

/// Session create result
public struct SessionCreateResult: Decodable, Sendable {
    public let sessionId: String
}

/// Session list result
public struct SessionListResult: Decodable, Sendable {
    public let sessions: [SessionInfo]
}

/// Session mode
public enum SessionMode: String, Codable, Sendable {
    case chat
    case code
}

/// Session info (for legacy/local subprocess)
public struct SessionInfo: Decodable, Sendable, Identifiable, Hashable {
    public let sessionId: String
    public let mode: SessionMode?
    public let createdAt: String?
    public let lastActivityAt: String?
    public let name: String?
    public let repoId: String?

    /// Manual initializer for testing/previews
    public init(
        sessionId: String,
        mode: SessionMode? = nil,
        createdAt: String? = nil,
        lastActivityAt: String? = nil,
        name: String? = nil,
        repoId: String? = nil
    ) {
        self.sessionId = sessionId
        self.mode = mode
        self.createdAt = createdAt
        self.lastActivityAt = lastActivityAt
        self.name = name
        self.repoId = repoId
    }

    /// Computed mode with default to .code for backwards compatibility
    public var resolvedMode: SessionMode {
        mode ?? .code
    }

    /// Identifiable conformance
    public var id: String { sessionId }

    /// Parse lastActivityAt into a Date
    public var lastActivityDate: Date? {
        guard let lastActivityAt else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: lastActivityAt) {
            return date
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: lastActivityAt)
    }

    /// Display name with fallback to truncated session ID
    public var displayName: String {
        name ?? String(sessionId.prefix(8)) + "..."
    }
}

// MARK: - RPC Commands

/// Base protocol for all RPC commands
@preconcurrency
public protocol RPCCommand: Encodable, Sendable {
    var type: String { get }
}

public enum StreamingBehavior: String, Codable, Sendable {
    case steer
    case followUp
}

/// Prompt command - send a message to the agent
public struct PromptCommand: RPCCommand, Sendable {
    public let type = "prompt"
    public let message: String
    public let customSystemPrompt: String?
    public let allowedTools: [String]?
    public let disallowedTools: [String]?
    public let mcpConfigPaths: [String]?
    public let streamingBehavior: StreamingBehavior?

    public init(
        message: String,
        customSystemPrompt: String? = nil,
        allowedTools: [String]? = nil,
        disallowedTools: [String]? = nil,
        mcpConfigPaths: [String]? = nil,
        streamingBehavior: StreamingBehavior? = nil
    ) {
        self.message = message
        self.customSystemPrompt = customSystemPrompt
        self.allowedTools = allowedTools
        self.disallowedTools = disallowedTools
        self.mcpConfigPaths = mcpConfigPaths
        self.streamingBehavior = streamingBehavior
    }
}

/// Abort command - cancel ongoing operation
public struct AbortCommand: RPCCommand, Sendable {
    public let type = "abort"
    public init() {}
}

/// Get current state
public struct GetStateCommand: RPCCommand, Sendable {
    public let type = "get_state"
    public init() {}
}

/// Get available models
public struct GetAvailableModelsCommand: RPCCommand, Sendable {
    public let type = "get_available_models"
    public init() {}
}

/// Set the active model
public struct SetModelCommand: RPCCommand, Sendable {
    public let type = "set_model"
    public let provider: String
    public let modelId: String

    public init(provider: String, modelId: String) {
        self.provider = provider
        self.modelId = modelId
    }
}

/// Get conversation history
public struct GetMessagesCommand: RPCCommand, Sendable {
    public let type = "get_messages"
    public init() {}
}

/// Start a new session
public struct NewSessionCommand: RPCCommand, Sendable {
    public let type = "new_session"
    public init() {}
}

/// Switch to an existing session
public struct SwitchSessionCommand: RPCCommand, Sendable {
    public let type = "switch_session"
    public let sessionPath: String

    public init(sessionPath: String) {
        self.sessionPath = sessionPath
    }
}

/// Clear conversation
public struct ClearConversationCommand: RPCCommand, Sendable {
    public let type = "clear_conversation"
    public init() {}
}

/// Get available slash commands
public struct GetCommandsCommand: RPCCommand, Sendable {
    public let type = "get_commands"
    public init() {}
}

// MARK: - RPC Response

/// Generic RPC response wrapper
public struct RPCResponse<T: Decodable & Sendable>: Decodable, Sendable {
    public let type: String
    public let command: String
    public let success: Bool
    public let data: T?
    public let error: RPCError?
}

/// RPC error details
public struct RPCError: Decodable, Error, Sendable {
    public let code: String?
    public let message: String
    public let details: String?

    public init(code: String?, message: String, details: String?) {
        self.code = code
        self.message = message
        self.details = details
    }
}

/// Raw response for initial parsing to determine routing
public struct RawRPCMessage: Decodable, Sendable {
    public let type: String

    // Response fields
    public let command: String?
    public let success: Bool?
    public let data: AnyCodable?
    public let error: RPCError?

    // Event fields (varies by event type)
    public let message: RawMessage?
    public let assistantMessageEvent: AssistantMessageEvent?
    public let toolCallId: String?
    public let toolName: String?
    public let args: AnyCodable?
    public let partialResult: ToolPartialResult?
    public let result: ToolResult?
    public let isError: Bool?
    public let context: StateContext?
    public let messages: [RawMessage]?
    public let messageId: String?
    public let stopReason: String?

    // auto_retry events
    public let attempt: Int?
    public let maxAttempts: Int?
    public let delayMs: Int?
    public let errorMessage: String?
    public let finalError: String?

    // hook_error / extension_error events
    public let extensionPath: String?
    public let event: String?

    // extension_ui_request events
    public let method: String?
    public let timeout: Int?
    public let title: String?
    public let options: [String]?
    public let placeholder: String?
    public let prefill: String?
    public let notifyType: String?
    public let statusKey: String?
    public let statusText: String?
    public let widgetKey: String?
    public let widgetLines: [String]?
    public let widgetPlacement: String?
    public let text: String?
}

/// Raw message from RPC (simplified version)
public struct RawMessage: Decodable, Sendable {
    public let role: String?
    public let content: AnyCodable?
}

/// Partial result from tool execution update
public struct ToolPartialResult: Decodable, Sendable {
    public let content: [ToolContent]?
    public let details: AnyCodable?
}

/// Tool result from tool execution end
public struct ToolResult: Decodable, Sendable {
    public let content: [ToolContent]?
    public let details: AnyCodable?
}

/// Content in tool results
public struct ToolContent: Decodable, Sendable {
    public let type: String
    public let text: String?
}

// MARK: - Model

/// Represents an available AI model
/// Model cost information (per million tokens)
public struct ModelCost: Codable, Sendable {
    public let input: Double
    public let output: Double
    public let cacheRead: Double
    public let cacheWrite: Double

    public init(input: Double, output: Double, cacheRead: Double = 0, cacheWrite: Double = 0) {
        self.input = input
        self.output = output
        self.cacheRead = cacheRead
        self.cacheWrite = cacheWrite
    }
}

/// Model information returned from the server
public struct Model: Codable, Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let api: String  // e.g., "anthropic-messages", "openai-completions"
    public let provider: String  // e.g., "anthropic", "openai", "google"
    public let baseUrl: String
    public let reasoning: Bool  // supports extended thinking
    public let input: [String]  // ["text"] or ["text", "image"]
    public let cost: ModelCost
    public let contextWindow: Int
    public let maxTokens: Int

    public init(
        id: String,
        name: String,
        api: String = "anthropic-messages",
        provider: String,
        baseUrl: String = "",
        reasoning: Bool = false,
        input: [String] = ["text"],
        cost: ModelCost = ModelCost(input: 0, output: 0),
        contextWindow: Int = 200000,
        maxTokens: Int = 8192
    ) {
        self.id = id
        self.name = name
        self.api = api
        self.provider = provider
        self.baseUrl = baseUrl
        self.reasoning = reasoning
        self.input = input
        self.cost = cost
        self.contextWindow = contextWindow
        self.maxTokens = maxTokens
    }

    /// Whether the model supports image input
    public var supportsImages: Bool {
        input.contains("image")
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(provider)
    }

    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.provider == rhs.provider
    }
}

// MARK: - State

/// Current agent state
public struct StateContext: Codable, Sendable {
    public let workingDirectory: String?
    public let model: Model?
    public let conversationId: String?
    public let messageCount: Int?
    public let isProcessing: Bool?
}

/// Response for get_state command
public struct GetStateResponse: Decodable, Sendable {
    public let model: Model?
    public let thinkingLevel: String?
    public let isStreaming: Bool?
    public let isCompacting: Bool?
    public let steeringMode: String?
    public let followUpMode: String?
    public let sessionFile: String?
    public let sessionId: String?
    public let autoCompactionEnabled: Bool?
    public let messageCount: Int?
    public let pendingMessageCount: Int?
}

/// Response for get_available_models command
public struct GetAvailableModelsResponse: Decodable, Sendable {
    public let models: [Model]

    public init(models: [Model]) {
        self.models = models
    }
}

/// Lightweight model info (used in events and session info)
public struct ModelInfo: Codable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let provider: String

    public init(id: String, name: String, provider: String) {
        self.id = id
        self.name = name
        self.provider = provider
    }

    /// Create from full Model
    public init(from model: Model) {
        self.id = model.id
        self.name = model.name
        self.provider = model.provider
    }
}

/// Response for session.attach command
public struct AttachSessionResponse: Decodable, Sendable {
    public let ok: Bool
    public let currentModel: ModelInfo?
}

/// Response for set_model command
public struct SetModelResponse: Decodable, Sendable {
    public let model: ModelInfo
}

// MARK: - Extension Events

/// Extension UI request methods
public enum ExtensionUIMethod: String, Codable, Sendable {
    // Dialog methods (require responses)
    case select
    case confirm
    case input
    case editor

    // Fire-and-forget methods (no response expected)
    case notify
    case setStatus
    case setWidget
    case setTitle
    case set_editor_text
}

/// Extension UI request event
public struct ExtensionUIRequest: Codable, Sendable {
    public let id: String
    public let method: ExtensionUIMethod
    public let timeout: Int?

    // select method
    public let title: String?
    public let options: [String]?

    // confirm method
    public let message: String?

    // input method
    public let placeholder: String?

    // editor method
    public let prefill: String?

    // notify method
    public let notifyType: String?

    // setStatus method
    public let statusKey: String?
    public let statusText: String?

    // setWidget method
    public let widgetKey: String?
    public let widgetLines: [String]?
    public let widgetPlacement: String?

    // set_editor_text method
    public let text: String?

    public init(
        id: String,
        method: ExtensionUIMethod,
        timeout: Int? = nil,
        title: String? = nil,
        options: [String]? = nil,
        message: String? = nil,
        placeholder: String? = nil,
        prefill: String? = nil,
        notifyType: String? = nil,
        statusKey: String? = nil,
        statusText: String? = nil,
        widgetKey: String? = nil,
        widgetLines: [String]? = nil,
        widgetPlacement: String? = nil,
        text: String? = nil
    ) {
        self.id = id
        self.method = method
        self.timeout = timeout
        self.title = title
        self.options = options
        self.message = message
        self.placeholder = placeholder
        self.prefill = prefill
        self.notifyType = notifyType
        self.statusKey = statusKey
        self.statusText = statusText
        self.widgetKey = widgetKey
        self.widgetLines = widgetLines
        self.widgetPlacement = widgetPlacement
        self.text = text
    }
}

/// Extension UI response command (client -> agent)
public struct ExtensionUIResponseCommand: RPCCommand, Sendable {
    public let type = "extension_ui_response"
    public let id: String
    public let value: String?
    public let confirmed: Bool?
    public let cancelled: Bool?

    public init(id: String, value: String? = nil, confirmed: Bool? = nil, cancelled: Bool? = nil) {
        self.id = id
        self.value = value
        self.confirmed = confirmed
        self.cancelled = cancelled
    }
}

/// Get default model command
public struct GetDefaultModelCommand: RPCCommand, Sendable {
    public let type = "get_default_model"
    public init() {}
}

/// Response for get_default_model command
public struct GetDefaultModelResponse: Decodable, Sendable {
    public let defaultModel: ModelInfo?
}

/// Set default model command
public struct SetDefaultModelCommand: RPCCommand, Sendable {
    public let type = "set_default_model"
    public let provider: String
    public let modelId: String

    public init(provider: String, modelId: String) {
        self.provider = provider
        self.modelId = modelId
    }
}

/// Response for set_default_model command
public struct SetDefaultModelResponse: Decodable, Sendable {
    public let defaultModel: ModelInfo
}

/// Response for prompt command
public struct PromptResponse: Decodable, Sendable {
    public let messageId: String?
}

// MARK: - Messages

/// A conversation message
public struct Message: Codable, Identifiable, Sendable {
    public let id: String
    public let role: MessageRole
    public let content: MessageContent?
    public let timestamp: Date?
    public let model: String?
    // For toolResult messages
    public let toolCallId: String?
    public let toolName: String?

    enum CodingKeys: String, CodingKey {
        case id, role, content, timestamp, model, toolCallId, toolName
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedId = try? container.decode(String.self, forKey: .id)
        let timestampString = try? container.decode(String.self, forKey: .timestamp)
        let timestampMs = try? container.decode(Double.self, forKey: .timestamp)

        if let decodedId {
            id = decodedId
        } else if let timestampString {
            id = timestampString
        } else if let timestampMs {
            id = String(format: "%.0f", timestampMs)
        } else {
            id = UUID().uuidString
        }

        role = try container.decode(MessageRole.self, forKey: .role)
        content = try container.decodeIfPresent(MessageContent.self, forKey: .content)
        model = try container.decodeIfPresent(String.self, forKey: .model)
        toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId)
        toolName = try container.decodeIfPresent(String.self, forKey: .toolName)

        if let timestampString {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            timestamp = formatter.date(from: timestampString)
        } else if let timestampMs {
            timestamp = Date(timeIntervalSince1970: timestampMs / 1000)
        } else {
            timestamp = nil
        }
    }
}

public enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
    case system
    case tool
    case toolResult
}

/// Message content - can be text or structured
public enum MessageContent: Codable, Sendable {
    case text(String)
    case structured([ContentBlock])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let text = try? container.decode(String.self) {
            self = .text(text)
        } else if let blocks = try? container.decode([ContentBlock].self) {
            self = .structured(blocks)
        } else {
            throw DecodingError.typeMismatch(
                Self.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Expected String or [ContentBlock]"
                )
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
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
public struct ContentBlock: Codable, Sendable {
    public let type: ContentBlockType
    public let text: String?
    public let thinking: String?
    public let toolCallId: String?
    public let toolName: String?
    public let input: AnyCodable?
    public let output: String?

    enum CodingKeys: String, CodingKey {
        case type, text, thinking, output
        case toolCallId, id
        case toolName, name
        case input, arguments
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(ContentBlockType.self, forKey: .type)
        text = try container.decodeIfPresent(String.self, forKey: .text)
        thinking = try container.decodeIfPresent(String.self, forKey: .thinking)
        output = try container.decodeIfPresent(String.self, forKey: .output)

        // Handle both toolCallId and id
        toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId)
            ?? container.decodeIfPresent(String.self, forKey: .id)

        // Handle both toolName and name
        toolName = try container.decodeIfPresent(String.self, forKey: .toolName)
            ?? container.decodeIfPresent(String.self, forKey: .name)

        // Handle both input and arguments
        input = try container.decodeIfPresent(AnyCodable.self, forKey: .input)
            ?? container.decodeIfPresent(AnyCodable.self, forKey: .arguments)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(text, forKey: .text)
        try container.encodeIfPresent(thinking, forKey: .thinking)
        try container.encodeIfPresent(toolCallId, forKey: .toolCallId)
        try container.encodeIfPresent(toolName, forKey: .toolName)
        try container.encodeIfPresent(input, forKey: .input)
        try container.encodeIfPresent(output, forKey: .output)
    }
}

public enum ContentBlockType: String, Codable, Sendable {
    case text
    case thinking
    case toolUse = "tool_use"
    case toolCall  // Pi SDK format
    case toolResult = "tool_result"
}

// MARK: - Event Payloads (matching pi-agent-core)
// Note: The event `type` is on the WSEvent envelope, NOT in these payloads.

/// Tool execution result content item (from pi-agent-core)
public struct ToolResultContentItem: Decodable, Sendable {
    public let type: String
    public let text: String?
}

/// Tool execution result (from pi-agent-core)
public struct ToolExecutionResultPayload: Decodable, Sendable {
    public let content: [ToolResultContentItem]
    public let details: AnyCodable?
}

/// tool_execution_start event payload
public struct ToolExecutionStartPayload: Decodable, Sendable {
    public let toolCallId: String
    public let toolName: String
    public let args: AnyCodable?
}

/// tool_execution_update event payload
public struct ToolExecutionUpdatePayload: Decodable, Sendable {
    public let toolCallId: String
    public let toolName: String
    public let args: AnyCodable?
    public let partialResult: ToolExecutionResultPayload?
}

/// tool_execution_end event payload
public struct ToolExecutionEndPayload: Decodable, Sendable {
    public let toolCallId: String
    public let toolName: String
    public let result: ToolExecutionResultPayload?
    public let isError: Bool
}

/// auto_retry_start event payload
public struct AutoRetryStartPayload: Decodable, Sendable {
    public let attempt: Int
    public let maxAttempts: Int
    public let delayMs: Int
    public let errorMessage: String
}

/// auto_retry_end event payload
public struct AutoRetryEndPayload: Decodable, Sendable {
    public let success: Bool
    public let attempt: Int
    public let finalError: String?
}

/// model_changed event payload (server-specific)
public struct ModelChangedPayload: Decodable, Sendable {
    public let model: ModelInfo
}

/// native_tool_request event payload (server-specific)
public struct NativeToolRequestPayload: Decodable, Sendable {
    public let callId: String
    public let toolName: String
    public let args: [String: AnyCodable]?
}

/// native_tool_cancel event payload (server-specific)
public struct NativeToolCancelPayload: Decodable, Sendable {
    public let callId: String
}

// MARK: - RPC Events

/// All possible RPC events from the server
public enum RPCEvent: Sendable {
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
    case hookError(extensionPath: String?, event: String?, error: String?) // Legacy name for extensionError
    case extensionError(extensionPath: String, event: String, error: String)
    case extensionUIRequest(ExtensionUIRequest)
    case stateUpdate(context: StateContext)
    case modelChanged(model: ModelInfo)
    case nativeToolRequest(NativeToolRequest)
    case nativeToolCancel(callId: String)
    case unknown(type: String, raw: Data)
}

public enum ToolStatus: String, Codable, Sendable {
    case success
    case error
    case cancelled
}

// MARK: - Helper Types for Decoding

/// Helper for decoding partial message in toolcall_start events
private struct PartialMessage: Codable {
    let content: [PartialContentBlock]
}

/// Helper for decoding content blocks in partial messages
private struct PartialContentBlock: Codable {
    let type: String
    let id: String?
    let name: String?
}

// MARK: - Assistant Message Events

/// Events for streaming assistant message updates
public enum AssistantMessageEvent: Codable, Sendable {
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
        case contentIndex
        case partial
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "text_delta":
            let delta = try container.decodeIfPresent(String.self, forKey: .delta) ?? ""
            self = .textDelta(delta: delta)

        case "text_start", "text_end":
            self = .textDelta(delta: "")

        case "thinking_delta":
            let delta = try container.decodeIfPresent(String.self, forKey: .delta) ?? ""
            self = .thinkingDelta(delta: delta)

        case "thinking_start", "thinking_end":
            self = .thinkingDelta(delta: "")

        case "tool_use_start", "toolcall_start":
            // Try top-level fields first (tool_use_start format)
            var toolCallId = try container.decodeIfPresent(String.self, forKey: .toolCallId)
            var toolName = try container.decodeIfPresent(String.self, forKey: .toolName)

            // If not found, extract from partial.content[contentIndex] (toolcall_start format)
            if toolCallId == nil || toolName == nil {
                let contentIndex = try container.decodeIfPresent(Int.self, forKey: .contentIndex) ?? 0
                if let partial = try container.decodeIfPresent(PartialMessage.self, forKey: .partial),
                   contentIndex < partial.content.count {
                    let block = partial.content[contentIndex]
                    if block.type == "toolCall" {
                        toolCallId = toolCallId ?? block.id
                        toolName = toolName ?? block.name
                    }
                }
            }

            self = .toolUseStart(toolCallId: toolCallId ?? "", toolName: toolName ?? "")

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
            self = .messageEnd(stopReason: "error")

        default:
            self = .unknown(type: type)
        }
    }

    public func encode(to encoder: Encoder) throws {
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
public struct AnyCodable: Codable, @unchecked Sendable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
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
        } else if let array = try? container.decode([Self].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: Self].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.typeMismatch(
                Self.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Cannot decode AnyCodable"
                )
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        // Unwrap nested AnyCodable
        let unwrappedValue: Any
        if let nested = value as? Self {
            unwrappedValue = nested.value
        } else {
            unwrappedValue = value
        }

        switch unwrappedValue {
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
            try container.encode(array.map { Self($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { Self($0) })
        default:
            throw EncodingError.invalidValue(
                unwrappedValue,
                EncodingError.Context(
                    codingPath: encoder.codingPath,
                    debugDescription: "Cannot encode \(type(of: unwrappedValue))"
                )
            )
        }
    }

    /// Convert to JSON Data
    public func toJSONData() throws -> Data {
        try JSONSerialization.data(withJSONObject: value)
    }

    /// Pretty-printed JSON string
    public var jsonString: String? {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: .prettyPrinted) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: - Conversation Response

public struct GetMessagesResponse: Decodable, Sendable {
    public let messages: [Message]
}

public struct NewSessionResponse: Decodable, Sendable {
    public let cancelled: Bool
}

public struct SwitchSessionResponse: Decodable, Sendable {
    public let cancelled: Bool
}

// MARK: - Commands (0.51.3+)

/// Slash command source type
public enum SlashCommandSource: String, Codable, Sendable {
    case `extension`
    case prompt  // Changed from "template" in 0.51.3
    case skill
}

/// Slash command location
public enum SlashCommandLocation: String, Codable, Sendable {
    case user
    case project
    case path
}

/// Information about an available slash command
public struct SlashCommandInfo: Codable, Sendable {
    public let name: String
    public let description: String?
    public let source: SlashCommandSource
    public let location: SlashCommandLocation?
    public let path: String?

    public init(
        name: String,
        description: String? = nil,
        source: SlashCommandSource,
        location: SlashCommandLocation? = nil,
        path: String? = nil
    ) {
        self.name = name
        self.description = description
        self.source = source
        self.location = location
        self.path = path
    }
}

/// Response for get_commands command
public struct GetCommandsResponse: Decodable, Sendable {
    public let commands: [SlashCommandInfo]
}
