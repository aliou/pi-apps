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
        case .tool(let tool):
            ToolCallRow(tool: tool)
        case .system(let sys):
            SystemEventRow(item: sys)
        }
    }
}
