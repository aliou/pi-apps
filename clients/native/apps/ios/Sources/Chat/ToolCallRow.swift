import SwiftUI
import PiCore
import PiUI

struct ToolCallRow: View {
    let tool: Client.ToolCallItem

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NavigationLink {
                ToolCallResultDetailView(tool: tool)
            } label: {
                VStack(alignment: .leading, spacing: 10) {
                    ToolCallHeader(
                        toolName: tool.name,
                        args: tool.argsJSON,
                        status: tool.status,
                        showChevron: true,
                        isExpanded: isExpanded
                    )

                    if isNativeTool {
                        NativeToolCallInlineView(toolName: tool.name)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        .foregroundStyle(.tertiary)
                    Text("Preview")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("Open details")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                ToolCallOutput(
                    toolName: tool.name,
                    args: tool.argsJSON,
                    output: tool.outputText
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .padding(.horizontal, 4)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 10))
    }

    private var isNativeTool: Bool {
        let toolNameLowercased = tool.name.lowercased()
        return toolNameLowercased.hasPrefix("xcode_") ||
            toolNameLowercased.hasPrefix("ios_") ||
            toolNameLowercased.hasPrefix("native")
    }
}

private struct NativeToolCallInlineView: View {
    let toolName: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "iphone")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("Native tool")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(toolName)
                .font(.caption2.monospaced())
                .foregroundStyle(.tertiary)
                .lineLimit(1)
            Spacer()
        }
    }
}

private struct ToolCallResultDetailView: View {
    let tool: Client.ToolCallItem

    var body: some View {
        ToolCallDetailView(
            toolName: tool.name,
            args: tool.argsJSON,
            output: tool.outputText,
            status: tool.status
        )
    }
}

private struct ReasoningMarkdownView: View {
    let markdown: String

    var body: some View {
        Group {
            if let attributed = try? AttributedString(
                markdown: markdown,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .full,
                    failurePolicy: .returnPartiallyParsedIfPossible
                )
            ) {
                Text(attributed)
            } else {
                Text(markdown)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .textSelection(.enabled)
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

#Preview("Native Tool") {
    ToolCallRow(
        tool: Client.ToolCallItem(
            id: "t3",
            name: "xcode_build_sim",
            argsJSON: "{\"scheme\": \"PiNative iOS\"}",
            outputText: "Build succeeded",
            status: .success,
            timestamp: "2025-01-01T00:00:00Z"
        )
    )
    .padding()
}

struct ReasoningRowView: View {
    let item: Client.ReasoningItem

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))

                    Text(item.isStreaming ? "Reasoning (live)" : "Reasoning")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                ReasoningMarkdownView(markdown: item.text)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 10)
            }
        }
        .padding(.horizontal, 4)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 10))
    }
}

#Preview("Reasoning Collapsed") {
    ReasoningRowView(
        item: Client.ReasoningItem(
            id: "r1",
            text: "I should inspect auth.swift first, then validate edge cases around token refresh.",
            timestamp: "2026-02-09T12:00:00Z",
            isStreaming: false
        )
    )
    .padding()
}

#Preview("Reasoning Streaming") {
    ReasoningRowView(
        item: Client.ReasoningItem(
            id: "r2",
            text: "Comparing two fixes: optimistic retry vs hard-fail on first auth mismatch.",
            timestamp: "2026-02-09T12:00:00Z",
            isStreaming: true
        )
    )
    .padding()
}
