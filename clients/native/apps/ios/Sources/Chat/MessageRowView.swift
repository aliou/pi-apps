import SwiftUI
import PiCore
import PiUI

struct MessageRowView: View {
    let item: Client.ConversationItem

    var body: some View {
        switch item {
        case .user(let msg):
            UserBubbleView(message: msg)
        case .assistant(let msg):
            AssistantMessageView(message: msg)
        case .reasoning(let reasoning):
            ReasoningRowView(item: reasoning)
        case .tool(let tool):
            ToolCallRow(tool: tool)
        case .system(let sys):
            SystemEventRow(item: sys)
        }
    }
}

#Preview("All Item Types") {
    VStack(spacing: 12) {
        MessageRowView(
            item: .user(
                Client.UserMessageItem(
                    id: "u1",
                    text: "Hello, can you help me?",
                    timestamp: "2025-01-01T00:00:00Z",
                    sendStatus: .sent
                )
            )
        )

        MessageRowView(
            item: .assistant(
                Client.AssistantMessageItem(
                    id: "a1",
                    text: "Of course! What do you need help with?",
                    timestamp: "2025-01-01T00:00:01Z",
                    isStreaming: false
                )
            )
        )

        MessageRowView(
            item: .reasoning(
                Client.ReasoningItem(
                    id: "r1",
                    text: "I need to inspect the auth flow before editing.",
                    timestamp: "2025-01-01T00:00:02Z",
                    isStreaming: false
                )
            )
        )

        MessageRowView(
            item: .tool(
                Client.ToolCallItem(
                    id: "t1",
                    name: "Bash",
                    argsJSON: "{\"command\": \"ls\"}",
                    outputText: "file1.txt\nfile2.txt",
                    status: .success,
                    timestamp: "2025-01-01T00:00:02Z"
                )
            )
        )

        MessageRowView(
            item: .system(
                Client.SystemItem(
                    id: "s1",
                    text: "Connection established",
                    timestamp: "2025-01-01T00:00:03Z"
                )
            )
        )
    }
    .padding()
}
