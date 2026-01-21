//
//  ConversationItem.swift
//  PiUI
//
//  Shared conversation item model for mobile and desktop apps
//

import Foundation

/// Represents an item in the conversation view
public enum ConversationItem: Identifiable, Sendable, Equatable {
    case userMessage(id: String, text: String, queuedBehavior: StreamingBehavior?)
    case assistantText(id: String, text: String)
    case toolCall(id: String, name: String, args: String?, output: String?, status: ToolCallStatus)

    public var id: String {
        switch self {
        case .userMessage(let id, _, _): return id
        case .assistantText(let id, _): return id
        case .toolCall(let id, _, _, _, _): return id
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
}
