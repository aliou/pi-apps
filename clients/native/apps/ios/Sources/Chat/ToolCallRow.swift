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

#Preview("Running") {
    ToolCallRow(
        tool: Client.ToolCallItem(
            id: "t1",
            name: "Bash",
            argsJSON: "{\"command\": \"ls -la\"}",
            outputText: "",
            status: .running,
            timestamp: "2025-01-01T00:00:00Z"
        )
    )
    .padding()
}

#Preview("Success with Output") {
    ToolCallRow(
        tool: Client.ToolCallItem(
            id: "t2",
            name: "Bash",
            argsJSON: "{\"command\": \"ls\"}",
            outputText: "file1.txt\nfile2.txt\nREADME.md",
            status: .success,
            timestamp: "2025-01-01T00:00:00Z"
        )
    )
    .padding()
}
