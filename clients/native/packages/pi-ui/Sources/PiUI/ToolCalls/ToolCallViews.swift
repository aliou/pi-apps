//
//  ToolCallViews.swift
//  PiUI
//
//  Shared SwiftUI views for tool call display
//

import SwiftUI
import PiCore

// MARK: - Tool Call Header

/// Collapsed header view for a tool call - used on both platforms
public struct ToolCallHeader: View {
    public let toolName: String
    public let args: String?
    public let status: Client.ToolCallStatus
    public let showChevron: Bool
    public let isExpanded: Bool

    public init(
        toolName: String,
        args: String?,
        status: Client.ToolCallStatus,
        showChevron: Bool = true,
        isExpanded: Bool = false
    ) {
        self.toolName = toolName
        self.args = args
        self.status = status
        self.showChevron = showChevron
        self.isExpanded = isExpanded
    }

    public var body: some View {
        let parsed = ParsedToolArgs(toolName: toolName, argsJSON: args)
        let summary = ToolCallSummary(args: parsed)

        HStack(spacing: 10) {
            // Status indicator
            Circle()
                .fill(toolStatusColor(status))
                .frame(width: 8, height: 8)

            // Tool icon
            Image(systemName: summary.icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.teal)
                .frame(width: 16)

            // Tool-specific content
            toolContent(parsed: parsed, summary: summary)

            Spacer()

            // Chevron (optional) - rotates when expanded
            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.secondary.opacity(0.6))
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
            }
        }
    }

    @ViewBuilder
    private func toolContent(parsed: ParsedToolArgs, summary: ToolCallSummary) -> some View {
        switch parsed {
        case .read(let path, let offset, let limit):
            readContent(path: path, offset: offset, limit: limit)

        case .write(let path, _):
            filePathContent(label: "write", path: path)

        case .edit(let path, _, _):
            filePathContent(label: "edit", path: path)

        case .bash(let command, _):
            bashContent(command: command)

        case .list(let path, let limit):
            listContent(path: path, limit: limit)

        case .find(let pattern, let path):
            searchContent(label: "find", pattern: pattern, path: path, glob: nil)

        case .grep(let pattern, let path, let glob, let literal):
            grepContent(pattern: pattern, path: path, glob: glob, literal: literal)

        case .unknown(let name, _):
            unknownContent(name: name)
        }
    }

    // MARK: - Tool-Specific Content Views

    private func readContent(path: String, offset: Int?, limit: Int?) -> some View {
        HStack(spacing: 4) {
            Text("read")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.teal)
                .lineLimit(1)

            if let offset {
                Text(":\(offset)")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.yellow)
                if let limit {
                    Text("-\(offset + limit - 1)")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(.yellow)
                }
            }
        }
    }

    private func filePathContent(label: String, path: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.teal)
                .lineLimit(1)
        }
    }

    private func bashContent(command: String) -> some View {
        HStack(spacing: 4) {
            Text("$")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            Text(command.isEmpty ? "..." : truncateCommand(command))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }

    private func listContent(path: String, limit: Int?) -> some View {
        HStack(spacing: 4) {
            Text("list")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.teal)
                .lineLimit(1)

            if let limit {
                Text("(\(limit))")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.secondary.opacity(0.6))
            }
        }
    }

    private func searchContent(label: String, pattern: String, path: String, glob: String?) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            Text(pattern.isEmpty ? "..." : pattern)
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.teal)
                .lineLimit(1)

            Text("in")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.secondary.opacity(0.6))

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(1)

            if let glob {
                Text("(\(glob))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary.opacity(0.6))
            }
        }
    }

    private func grepContent(pattern: String, path: String, glob: String?, literal: Bool) -> some View {
        HStack(spacing: 4) {
            Text("grep")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)

            let patternDisplay = pattern.isEmpty ? "..." : (literal ? pattern : "/\(pattern)/")
            Text(patternDisplay)
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(.teal)
                .lineLimit(1)

            Text("in")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.secondary.opacity(0.6))

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(1)

            if let glob {
                Text("(\(glob))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary.opacity(0.6))
            }
        }
    }

    private func unknownContent(name: String) -> some View {
        HStack(spacing: 4) {
            Text(name)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(.primary)
        }
    }

    private func truncateCommand(_ command: String) -> String {
        let cleaned = command.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\n", with: " ")
        if cleaned.count > 50 {
            return String(cleaned.prefix(50)) + "..."
        }
        return cleaned
    }

    private func toolStatusColor(_ status: Client.ToolCallStatus) -> Color {
        switch status {
        case .running: return .yellow
        case .success: return .green
        case .error: return .red
        }
    }
}

// MARK: - Tool Call Output View

/// Expandable output view for tool results
public struct ToolCallOutput: View {
    public let toolName: String
    public let args: String?
    public let output: String?
    public let maxPreviewLines: Int

    public init(
        toolName: String,
        args: String?,
        output: String?,
        maxPreviewLines: Int = 10
    ) {
        self.toolName = toolName
        self.args = args
        self.output = output
        self.maxPreviewLines = maxPreviewLines
    }

    public var body: some View {
        let parsed = ParsedToolArgs(toolName: toolName, argsJSON: args)

        VStack(alignment: .leading, spacing: 12) {
            // Arguments section (for unknown tools or detailed view)
            if case .unknown(_, let rawJSON) = parsed, let json = rawJSON {
                argsSection(json: json)
            }

            // Output section
            if let output, !output.isEmpty {
                outputSection(output: output)
            }
        }
    }

    private func argsSection(json: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Arguments")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary.opacity(0.6))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                Text(ToolOutputFormatter.prettyJSON(json) ?? json)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.secondary)
                    .textSelection(.enabled)
            }
            .padding(8)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(6)
        }
    }

    private func outputSection(output: String) -> some View {
        let preview = ToolOutputFormatter.preview(output, maxLines: maxPreviewLines)

        return VStack(alignment: .leading, spacing: 6) {
            Text("Output")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary.opacity(0.6))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(preview.lines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.secondary)
                    }

                    if preview.hasMore {
                        Text("... (\(preview.moreCount) more lines)")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.secondary.opacity(0.6))
                            .italic()
                    }
                }
                .textSelection(.enabled)
            }
            .frame(maxHeight: 200)
            .padding(8)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(6)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ToolCallHeader_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 12) {
            // Collapsed state
            ToolCallHeader(
                toolName: "read",
                args: "{\"path\": \"src/main.swift\", \"offset\": 10, \"limit\": 50}",
                status: .success,
                showChevron: true,
                isExpanded: false
            )

            // Expanded state
            ToolCallHeader(
                toolName: "bash",
                args: "{\"command\": \"npm run build && npm test\"}",
                status: .running,
                showChevron: true,
                isExpanded: true
            )

            ToolCallHeader(
                toolName: "grep",
                args: "{\"pattern\": \"TODO\", \"path\": \".\", \"glob\": \"*.swift\"}",
                status: .error,
                showChevron: true,
                isExpanded: false
            )

            ToolCallHeader(
                toolName: "custom_tool",
                args: "{\"foo\": \"bar\", \"count\": 42}",
                status: .success,
                showChevron: true,
                isExpanded: false
            )
        }
        .padding()
        .background(Color.gray.opacity(0.05))
        .previewLayout(.sizeThatFits)
    }
}

#endif
