import Foundation

extension Relay {
    public enum ServerEvent: Sendable {
        // Relay-specific events
        case connected(sessionId: String, lastSeq: Int)
        case replayStart(fromSeq: Int, toSeq: Int)
        case replayEnd
        case sandboxStatus(status: SandboxStatus, message: String?)
        case error(code: String, message: String)

        // Pi agent events
        case agentStart
        case agentEnd(messages: [AnyCodable])
        case turnStart
        case turnEnd(message: AnyCodable, toolResults: [AnyCodable])
        case messageStart(message: AnyCodable)
        case messageUpdate(message: AnyCodable, assistantMessageEvent: AnyCodable)
        case messageEnd(message: AnyCodable)
        case toolExecutionStart(toolCallId: String, toolName: String, args: AnyCodable)
        case toolExecutionUpdate(toolCallId: String, toolName: String, args: AnyCodable, partialResult: AnyCodable)
        case toolExecutionEnd(toolCallId: String, toolName: String, result: AnyCodable, isError: Bool)
        case autoCompactionStart(reason: String)
        case autoCompactionEnd(result: AnyCodable, aborted: Bool, willRetry: Bool, errorMessage: String?)
        case autoRetryStart(attempt: Int, maxAttempts: Int, delayMs: Int, errorMessage: String)
        case autoRetryEnd(success: Bool, attempt: Int, finalError: String?)
        case extensionError(extensionPath: String, event: String, error: String)
        case extensionUIRequest(id: String, method: String, payload: AnyCodable)
        case response(command: String, success: Bool, data: AnyCodable?, error: String?, id: String?)

        // Unknown event type (forward compatibility)
        case unknown(type: String, payload: AnyCodable)
    }
}

// MARK: - Decodable

extension Relay.ServerEvent: Decodable {
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKeys.self)
        let type = try container.decode(String.self, forKey: DynamicCodingKeys.string("type"))

        switch type {
        case "connected":
            let sessionId = try container.decode(String.self, forKey: DynamicCodingKeys.string("sessionId"))
            let lastSeq = try container.decode(Int.self, forKey: DynamicCodingKeys.string("lastSeq"))
            self = .connected(sessionId: sessionId, lastSeq: lastSeq)

        case "replay_start":
            let fromSeq = try container.decode(Int.self, forKey: DynamicCodingKeys.string("fromSeq"))
            let toSeq = try container.decode(Int.self, forKey: DynamicCodingKeys.string("toSeq"))
            self = .replayStart(fromSeq: fromSeq, toSeq: toSeq)

        case "replay_end":
            self = .replayEnd

        case "sandbox_status":
            let status = try container.decode(Relay.SandboxStatus.self, forKey: DynamicCodingKeys.string("status"))
            let message = try container.decodeIfPresent(String.self, forKey: DynamicCodingKeys.string("message"))
            self = .sandboxStatus(status: status, message: message)

        case "error":
            let code = try container.decode(String.self, forKey: DynamicCodingKeys.string("code"))
            let message = try container.decode(String.self, forKey: DynamicCodingKeys.string("message"))
            self = .error(code: code, message: message)

        case "agent_start":
            self = .agentStart

        case "agent_end":
            let messages = try container.decode([Relay.AnyCodable].self, forKey: DynamicCodingKeys.string("messages"))
            self = .agentEnd(messages: messages)

        case "turn_start":
            self = .turnStart

        case "turn_end":
            let message = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("message"))
            let toolResults = try container.decode(
                [Relay.AnyCodable].self, forKey: DynamicCodingKeys.string("toolResults")
            )
            self = .turnEnd(message: message, toolResults: toolResults)

        case "message_start":
            let message = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("message"))
            self = .messageStart(message: message)

        case "message_update":
            let message = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("message"))
            let assistantMessageEvent = try container.decode(
                Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("assistantMessageEvent")
            )
            self = .messageUpdate(message: message, assistantMessageEvent: assistantMessageEvent)

        case "message_end":
            let message = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("message"))
            self = .messageEnd(message: message)

        case "tool_execution_start":
            let toolCallId = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolCallId"))
            let toolName = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolName"))
            let args = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("args"))
            self = .toolExecutionStart(toolCallId: toolCallId, toolName: toolName, args: args)

        case "tool_execution_update":
            let toolCallId = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolCallId"))
            let toolName = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolName"))
            let args = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("args"))
            let partialResult = try container.decode(
                Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("partialResult")
            )
            self = .toolExecutionUpdate(
                toolCallId: toolCallId, toolName: toolName, args: args, partialResult: partialResult
            )

        case "tool_execution_end":
            let toolCallId = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolCallId"))
            let toolName = try container.decode(String.self, forKey: DynamicCodingKeys.string("toolName"))
            let result = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("result"))
            let isError = try container.decode(Bool.self, forKey: DynamicCodingKeys.string("isError"))
            self = .toolExecutionEnd(toolCallId: toolCallId, toolName: toolName, result: result, isError: isError)

        case "auto_compaction_start":
            let reason = try container.decode(String.self, forKey: DynamicCodingKeys.string("reason"))
            self = .autoCompactionStart(reason: reason)

        case "auto_compaction_end":
            let result = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("result"))
            let aborted = try container.decode(Bool.self, forKey: DynamicCodingKeys.string("aborted"))
            let willRetry = try container.decode(Bool.self, forKey: DynamicCodingKeys.string("willRetry"))
            let errorMessage = try container.decodeIfPresent(
                String.self, forKey: DynamicCodingKeys.string("errorMessage")
            )
            self = .autoCompactionEnd(
                result: result, aborted: aborted, willRetry: willRetry, errorMessage: errorMessage
            )

        case "auto_retry_start":
            let attempt = try container.decode(Int.self, forKey: DynamicCodingKeys.string("attempt"))
            let maxAttempts = try container.decode(Int.self, forKey: DynamicCodingKeys.string("maxAttempts"))
            let delayMs = try container.decode(Int.self, forKey: DynamicCodingKeys.string("delayMs"))
            let errorMessage = try container.decode(String.self, forKey: DynamicCodingKeys.string("errorMessage"))
            self = .autoRetryStart(
                attempt: attempt, maxAttempts: maxAttempts, delayMs: delayMs, errorMessage: errorMessage
            )

        case "auto_retry_end":
            let success = try container.decode(Bool.self, forKey: DynamicCodingKeys.string("success"))
            let attempt = try container.decode(Int.self, forKey: DynamicCodingKeys.string("attempt"))
            let finalError = try container.decodeIfPresent(String.self, forKey: DynamicCodingKeys.string("finalError"))
            self = .autoRetryEnd(success: success, attempt: attempt, finalError: finalError)

        case "extension_error":
            let extensionPath = try container.decode(String.self, forKey: DynamicCodingKeys.string("extensionPath"))
            let event = try container.decode(String.self, forKey: DynamicCodingKeys.string("event"))
            let error = try container.decode(String.self, forKey: DynamicCodingKeys.string("error"))
            self = .extensionError(extensionPath: extensionPath, event: event, error: error)

        case "extension_ui_request":
            let id = try container.decode(String.self, forKey: DynamicCodingKeys.string("id"))
            let method = try container.decode(String.self, forKey: DynamicCodingKeys.string("method"))
            let payload = try container.decode(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("payload"))
            self = .extensionUIRequest(id: id, method: method, payload: payload)

        case "response":
            let command = try container.decode(String.self, forKey: DynamicCodingKeys.string("command"))
            let success = try container.decode(Bool.self, forKey: DynamicCodingKeys.string("success"))
            let data = try container.decodeIfPresent(Relay.AnyCodable.self, forKey: DynamicCodingKeys.string("data"))
            let error = try container.decodeIfPresent(String.self, forKey: DynamicCodingKeys.string("error"))
            let id = try container.decodeIfPresent(String.self, forKey: DynamicCodingKeys.string("id"))
            self = .response(command: command, success: success, data: data, error: error, id: id)

        default:
            let payload = try Relay.AnyCodable(from: decoder)
            self = .unknown(type: type, payload: payload)
        }
    }
}

// Helper for dynamic coding keys
private struct DynamicCodingKeys: CodingKey {
    var stringValue: String

    init?(stringValue: String) {
        self.stringValue = stringValue
    }

    var intValue: Int? { nil }

    init?(intValue: Int) {
        return nil
    }

    static func string(_ value: String) -> DynamicCodingKeys {
        DynamicCodingKeys(stringValue: value)!
    }
}
