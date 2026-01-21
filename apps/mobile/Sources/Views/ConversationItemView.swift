//
//  ConversationItemView.swift
//  Pi
//
//  View for rendering a single conversation item (message or tool call)
//

import SwiftUI
import PiUI

struct ConversationItemView: View {
    let item: ConversationItem

    var body: some View {
        switch item {
        case .userMessage(_, let text, let queuedBehavior):
            userMessageView(text: text, queuedBehavior: queuedBehavior)

        case .assistantText(_, let text):
            MessageBubbleView(role: .assistant, text: text)

        case .toolCall(_, let name, let args, _, let status):
            toolCallView(name: name, args: args, status: status)
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private func userMessageView(text: String, queuedBehavior: StreamingBehavior?) -> some View {
        if let queuedBehavior {
            VStack(alignment: .trailing, spacing: 4) {
                HStack {
                    Spacer()
                    Text(queuedBehavior == .steer ? "steer" : "follow-up")
                        .font(.caption2)
                        .foregroundStyle(Theme.textSecondary)
                }
                .padding(.horizontal, 16)

                MessageBubbleView(role: .user, text: text, isQueued: true)
            }
        } else {
            MessageBubbleView(role: .user, text: text)
        }
    }

    private func toolCallView(name: String, args: String?, status: ToolCallStatus) -> some View {
        ToolCallHeader(
            toolName: name,
            args: args,
            status: status,
            showChevron: false
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.toolStatusBg(status))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 16)
    }
}

// MARK: - Previews

#Preview("User Message") {
    VStack(spacing: 16) {
        ConversationItemView(item: .userMessage(id: "1", text: "Hello, how can I help you?", queuedBehavior: nil))
        ConversationItemView(item: .userMessage(id: "2", text: "This is queued", queuedBehavior: .steer))
        ConversationItemView(item: .userMessage(id: "3", text: "Follow-up message", queuedBehavior: .followUp))
    }
    .padding()
    .background(Theme.pageBg)
}

#Preview("Assistant Text") {
    ConversationItemView(item: .assistantText(id: "1", text: "Here's my response to your question."))
        .padding()
        .background(Theme.pageBg)
}

#Preview("Tool Calls") {
    VStack(spacing: 16) {
        ConversationItemView(item: .toolCall(id: "1", name: "Read", args: "{\"path\": \"file.txt\"}", output: nil, status: .running))
        ConversationItemView(item: .toolCall(id: "2", name: "Bash", args: "{\"command\": \"ls -la\"}", output: "success", status: .success))
        ConversationItemView(item: .toolCall(id: "3", name: "Write", args: nil, output: "error", status: .error))
    }
    .padding()
    .background(Theme.pageBg)
}
