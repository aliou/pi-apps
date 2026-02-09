import Foundation

extension Client {
    /// A single row in the chat transcript.
    public enum ConversationItem: Identifiable, Equatable, Sendable {
        case user(UserMessageItem)
        case assistant(AssistantMessageItem)
        case reasoning(ReasoningItem)
        case tool(ToolCallItem)
        case system(SystemItem)

        public var id: String {
            switch self {
            case .user(let item): item.id
            case .assistant(let item): item.id
            case .reasoning(let item): item.id
            case .tool(let item): item.id
            case .system(let item): item.id
            }
        }
    }

    public enum MessageSendStatus: Equatable, Sendable {
        case sending
        case sent
        case failed
    }

    public struct UserMessageItem: Identifiable, Equatable, Sendable {
        public let id: String
        public let text: String
        public let timestamp: String
        public var sendStatus: MessageSendStatus

        public init(id: String, text: String, timestamp: String, sendStatus: MessageSendStatus = .sent) {
            self.id = id
            self.text = text
            self.timestamp = timestamp
            self.sendStatus = sendStatus
        }
    }

    public struct AssistantMessageItem: Identifiable, Equatable, Sendable {
        public let id: String
        public var text: String
        public var timestamp: String
        public var isStreaming: Bool

        public init(id: String, text: String, timestamp: String, isStreaming: Bool = false) {
            self.id = id
            self.text = text
            self.timestamp = timestamp
            self.isStreaming = isStreaming
        }
    }

    public struct ReasoningItem: Identifiable, Equatable, Sendable {
        public let id: String
        public var text: String
        public var timestamp: String
        public var isStreaming: Bool

        public init(id: String, text: String, timestamp: String, isStreaming: Bool = false) {
            self.id = id
            self.text = text
            self.timestamp = timestamp
            self.isStreaming = isStreaming
        }
    }

    public struct ToolCallItem: Identifiable, Equatable, Sendable {
        public let id: String
        public var name: String
        public var argsJSON: String
        public var outputText: String
        public var status: ToolCallStatus
        public var timestamp: String

        public init(
            id: String,
            name: String,
            argsJSON: String,
            outputText: String = "",
            status: ToolCallStatus = .running,
            timestamp: String = ""
        ) {
            self.id = id
            self.name = name
            self.argsJSON = argsJSON
            self.outputText = outputText
            self.status = status
            self.timestamp = timestamp
        }
    }

    public struct SystemItem: Identifiable, Equatable, Sendable {
        public let id: String
        public let text: String
        public let timestamp: String

        public init(id: String, text: String, timestamp: String = "") {
            self.id = id
            self.text = text
            self.timestamp = timestamp
        }
    }
}
