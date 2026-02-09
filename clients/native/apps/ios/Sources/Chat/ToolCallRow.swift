import SwiftUI
import PiCore
import PiUI

struct ToolCallRow: View {
    let tool: Client.ToolCallItem

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                ToolCallHeader(
                    toolName: tool.name,
                    args: tool.argsJSON,
                    status: tool.status,
                    showChevron: true,
                    isExpanded: isExpanded
                )
            }
            .buttonStyle(.plain)

            if isExpanded {
                ToolCallOutput(
                    toolName: tool.name,
                    args: tool.argsJSON,
                    output: tool.outputText
                )
                .padding(.leading, 18)
                .padding(.top, 8)
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 8))
    }
}
