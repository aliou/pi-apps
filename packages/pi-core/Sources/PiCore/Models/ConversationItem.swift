//
//  ConversationItem.swift
//  PiCore
//
//  Conversation item model for representing messages in the UI
//

import Foundation

/// System event types for inline display
public enum SystemEventType: Sendable, Equatable {
    case modelSwitch(fromModel: String?, toModel: String)
}

/// Represents an item in the conversation view
public enum ConversationItem: Identifiable, Sendable, Equatable {
    case userMessage(id: String, text: String, queuedBehavior: StreamingBehavior?)
    case assistantText(id: String, text: String)
    case toolCall(id: String, name: String, args: String?, output: String?, status: ToolCallStatus)
    case systemEvent(id: String, event: SystemEventType)
    case richContent(id: String, content: DisplayContent, summary: String)

    public var id: String {
        switch self {
        case .userMessage(let id, _, _): return id
        case .assistantText(let id, _): return id
        case .toolCall(let id, _, _, _, _): return id
        case .systemEvent(let id, _): return id
        case .richContent(let id, _, _): return id
        }
    }

    public static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.userMessage(let id1, let text1, let behavior1), .userMessage(let id2, let text2, let behavior2)):
            return id1 == id2 && text1 == text2 && behavior1 == behavior2
        case (.assistantText(let id1, let text1), .assistantText(let id2, let text2)):
            return id1 == id2 && text1 == text2
        case (.toolCall(let id1, let name1, let args1, let output1, let status1),
              .toolCall(let id2, let name2, let args2, let output2, let status2)):
            return id1 == id2 && name1 == name2 && args1 == args2 && output1 == output2 && status1 == status2
        case (.systemEvent(let id1, let event1), .systemEvent(let id2, let event2)):
            return id1 == id2 && event1 == event2
        case (.richContent(let id1, let content1, let summary1), .richContent(let id2, let content2, let summary2)):
            return id1 == id2 && content1 == content2 && summary1 == summary2
        default:
            return false
        }
    }
}

/// Helper extension for creating conversation items
extension ConversationItem {
    /// Create a user message with auto-generated ID
    public static func user(_ text: String, queuedBehavior: StreamingBehavior? = nil) -> Self {
        .userMessage(id: UUID().uuidString, text: text, queuedBehavior: queuedBehavior)
    }

    /// Create an assistant text with auto-generated ID
    public static func assistant(_ text: String) -> Self {
        .assistantText(id: UUID().uuidString, text: text)
    }

    /// Create a tool call with auto-generated ID
    public static func tool(name: String, args: String? = nil, output: String? = nil, status: ToolCallStatus = .running) -> Self {
        .toolCall(id: UUID().uuidString, name: name, args: args, output: output, status: status)
    }

    /// Create a model switch event with auto-generated ID
    public static func modelSwitch(from: String?, to: String) -> Self {
        .systemEvent(id: UUID().uuidString, event: .modelSwitch(fromModel: from, toModel: to))
    }

    /// Create rich content item from display envelope
    public static func rich(from envelope: DisplayEnvelope, id: String = UUID().uuidString) -> Self? {
        guard let display = envelope.display else { return nil }
        return .richContent(id: id, content: display, summary: envelope.summary)
    }
}
