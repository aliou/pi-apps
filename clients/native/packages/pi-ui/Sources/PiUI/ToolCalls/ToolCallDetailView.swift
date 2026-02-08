//
//  ToolCallDetailView.swift
//  PiUI
//
//  Full detail view for a tool call - used on iOS for navigation
//

import SwiftUI
import PiCore

// MARK: - Tool Call Detail View

/// Full detail view for a tool call - used on iOS for navigation
public struct ToolCallDetailView: View {
    public let toolName: String
    public let args: String?
    public let output: String?
    public let status: Client.ToolCallStatus

    public init(
        toolName: String,
        args: String?,
        output: String?,
        status: Client.ToolCallStatus
    ) {
        self.toolName = toolName
        self.args = args
        self.output = output
        self.status = status
    }

    public var body: some View {
        let parsed = ParsedToolArgs(toolName: toolName, argsJSON: args)
        let summary = ToolCallSummary(args: parsed)

        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header card with status
                headerCard(parsed: parsed, summary: summary)

                // Tool-specific expanded content
                ToolCallExpandedContent(
                    toolName: toolName,
                    args: args,
                    output: output,
                    status: status
                )

                Spacer()
            }
            .padding(16)
        }
        .background(Color.gray.opacity(0.05))
        .navigationTitle(parsed.toolType.label)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func headerCard(
        parsed: ParsedToolArgs,
        summary: ToolCallSummary
    ) -> some View {
        HStack(spacing: 12) {
            // Icon
            ZStack {
                Circle()
                    .fill(toolStatusBg(status))
                    .frame(width: 44, height: 44)

                Image(systemName: summary.icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(toolStatusColor(status))
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(summary.title)
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .foregroundColor(.primary)
                    .lineLimit(2)

                if let subtitle = summary.subtitle {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }

                // Status badge
                HStack(spacing: 4) {
                    Circle()
                        .fill(toolStatusColor(status))
                        .frame(width: 6, height: 6)
                    Text(status.displayName)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(toolStatusColor(status))
                }
            }

            Spacer()
        }
        .padding(16)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }

    private func toolStatusColor(_ status: Client.ToolCallStatus) -> Color {
        switch status {
        case .running: return .yellow
        case .success: return .green
        case .error: return .red
        }
    }

    private func toolStatusBg(_ status: Client.ToolCallStatus) -> Color {
        switch status {
        case .running: return .yellow.opacity(0.1)
        case .success: return .green.opacity(0.1)
        case .error: return .red.opacity(0.1)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ToolCallDetailView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            ToolCallDetailView(
                toolName: "bash",
                args: "{\"command\": \"ls -la\", \"timeout\": 30}",
                output: """
                    total 64
                    drwxr-xr-x  12 user  staff   384 Jan 19 10:00 .
                    drwxr-xr-x   6 user  staff   192 Jan 18 09:00 ..
                    -rw-r--r--   1 user  staff  1234 Jan 19 10:00 main.swift
                    """,
                status: .success
            )
        }
    }
}
#endif
