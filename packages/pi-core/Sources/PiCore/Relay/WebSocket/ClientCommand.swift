import Foundation

public enum ClientCommand: Sendable {
    case prompt(message: String, images: [AnyCodable]? = nil, streamingBehavior: StreamingBehavior? = nil)
    case steer(message: String)
    case followUp(message: String)
    case abort
    case newSession(parentSession: String? = nil)
    case getState
    case getMessages
    case setModel(provider: String, modelId: String)
    case cycleModel
    case getAvailableModels
    case setThinkingLevel(ThinkingLevel)
    case cycleThinkingLevel
    case setSteeringMode(QueueMode)
    case setFollowUpMode(QueueMode)
    case compact(customInstructions: String? = nil)
    case setAutoCompaction(enabled: Bool)
    case setAutoRetry(enabled: Bool)
    case abortRetry
    case bash(command: String)
    case abortBash
    case getSessionStats
    case exportHtml(outputPath: String? = nil)
    case switchSession(sessionPath: String)
    case fork(entryId: String)
    case getForkMessages
    case getLastAssistantText
    case setSessionName(name: String)
    case getCommands
    case extensionUIResponse(id: String, value: AnyCodable? = nil, confirmed: Bool? = nil, cancelled: Bool? = nil)

    public enum StreamingBehavior: String, Codable, Sendable, Hashable {
        case steer
        case followUp
    }

    public enum ThinkingLevel: String, Codable, Sendable, Hashable {
        case off
        case minimal
        case low
        case medium
        case high
        case xhigh
    }

    public enum QueueMode: String, Codable, Sendable, Hashable {
        case all
        case oneAtATime = "one-at-a-time"
    }
}

// MARK: - Encodable

extension ClientCommand: Encodable {
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKeys.self)

        switch self {
        case let .prompt(message, images, streamingBehavior):
            try container.encode("prompt", forKey: DynamicCodingKeys.string("type"))
            try container.encode(message, forKey: DynamicCodingKeys.string("message"))
            if let images {
                try container.encode(images, forKey: DynamicCodingKeys.string("images"))
            }
            if let streamingBehavior {
                try container.encode(streamingBehavior, forKey: DynamicCodingKeys.string("streamingBehavior"))
            }

        case let .steer(message):
            try container.encode("steer", forKey: DynamicCodingKeys.string("type"))
            try container.encode(message, forKey: DynamicCodingKeys.string("message"))

        case let .followUp(message):
            try container.encode("follow_up", forKey: DynamicCodingKeys.string("type"))
            try container.encode(message, forKey: DynamicCodingKeys.string("message"))

        case .abort:
            try container.encode("abort", forKey: DynamicCodingKeys.string("type"))

        case let .newSession(parentSession):
            try container.encode("new_session", forKey: DynamicCodingKeys.string("type"))
            if let parentSession {
                try container.encode(parentSession, forKey: DynamicCodingKeys.string("parentSession"))
            }

        case .getState:
            try container.encode("get_state", forKey: DynamicCodingKeys.string("type"))

        case .getMessages:
            try container.encode("get_messages", forKey: DynamicCodingKeys.string("type"))

        case let .setModel(provider, modelId):
            try container.encode("set_model", forKey: DynamicCodingKeys.string("type"))
            try container.encode(provider, forKey: DynamicCodingKeys.string("provider"))
            try container.encode(modelId, forKey: DynamicCodingKeys.string("modelId"))

        case .cycleModel:
            try container.encode("cycle_model", forKey: DynamicCodingKeys.string("type"))

        case .getAvailableModels:
            try container.encode("get_available_models", forKey: DynamicCodingKeys.string("type"))

        case let .setThinkingLevel(level):
            try container.encode("set_thinking_level", forKey: DynamicCodingKeys.string("type"))
            try container.encode(level, forKey: DynamicCodingKeys.string("level"))

        case .cycleThinkingLevel:
            try container.encode("cycle_thinking_level", forKey: DynamicCodingKeys.string("type"))

        case let .setSteeringMode(mode):
            try container.encode("set_steering_mode", forKey: DynamicCodingKeys.string("type"))
            try container.encode(mode, forKey: DynamicCodingKeys.string("mode"))

        case let .setFollowUpMode(mode):
            try container.encode("set_follow_up_mode", forKey: DynamicCodingKeys.string("type"))
            try container.encode(mode, forKey: DynamicCodingKeys.string("mode"))

        case let .compact(customInstructions):
            try container.encode("compact", forKey: DynamicCodingKeys.string("type"))
            if let customInstructions {
                try container.encode(customInstructions, forKey: DynamicCodingKeys.string("customInstructions"))
            }

        case let .setAutoCompaction(enabled):
            try container.encode("set_auto_compaction", forKey: DynamicCodingKeys.string("type"))
            try container.encode(enabled, forKey: DynamicCodingKeys.string("enabled"))

        case let .setAutoRetry(enabled):
            try container.encode("set_auto_retry", forKey: DynamicCodingKeys.string("type"))
            try container.encode(enabled, forKey: DynamicCodingKeys.string("enabled"))

        case .abortRetry:
            try container.encode("abort_retry", forKey: DynamicCodingKeys.string("type"))

        case let .bash(command):
            try container.encode("bash", forKey: DynamicCodingKeys.string("type"))
            try container.encode(command, forKey: DynamicCodingKeys.string("command"))

        case .abortBash:
            try container.encode("abort_bash", forKey: DynamicCodingKeys.string("type"))

        case .getSessionStats:
            try container.encode("get_session_stats", forKey: DynamicCodingKeys.string("type"))

        case let .exportHtml(outputPath):
            try container.encode("export_html", forKey: DynamicCodingKeys.string("type"))
            if let outputPath {
                try container.encode(outputPath, forKey: DynamicCodingKeys.string("outputPath"))
            }

        case let .switchSession(sessionPath):
            try container.encode("switch_session", forKey: DynamicCodingKeys.string("type"))
            try container.encode(sessionPath, forKey: DynamicCodingKeys.string("sessionPath"))

        case let .fork(entryId):
            try container.encode("fork", forKey: DynamicCodingKeys.string("type"))
            try container.encode(entryId, forKey: DynamicCodingKeys.string("entryId"))

        case .getForkMessages:
            try container.encode("get_fork_messages", forKey: DynamicCodingKeys.string("type"))

        case .getLastAssistantText:
            try container.encode("get_last_assistant_text", forKey: DynamicCodingKeys.string("type"))

        case let .setSessionName(name):
            try container.encode("set_session_name", forKey: DynamicCodingKeys.string("type"))
            try container.encode(name, forKey: DynamicCodingKeys.string("name"))

        case .getCommands:
            try container.encode("get_commands", forKey: DynamicCodingKeys.string("type"))

        case let .extensionUIResponse(id, value, confirmed, cancelled):
            try container.encode("extension_ui_response", forKey: DynamicCodingKeys.string("type"))
            try container.encode(id, forKey: DynamicCodingKeys.string("id"))
            if let value {
                try container.encode(value, forKey: DynamicCodingKeys.string("value"))
            }
            if let confirmed {
                try container.encode(confirmed, forKey: DynamicCodingKeys.string("confirmed"))
            }
            if let cancelled {
                try container.encode(cancelled, forKey: DynamicCodingKeys.string("cancelled"))
            }
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
