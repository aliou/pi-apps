//
//  ToolCallViews.swift
//  PiUI
//
//  Shared SwiftUI views for tool call display
//

import SwiftUI

// MARK: - Tool Call Header

/// Collapsed header view for a tool call - used on both platforms
public struct ToolCallHeader: View {
    public let toolName: String
    public let args: String?
    public let status: ToolCallStatus
    public let showChevron: Bool
    public let isExpanded: Bool

    public init(
        toolName: String,
        args: String?,
        status: ToolCallStatus,
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
                .fill(Theme.toolStatusColor(status))
                .frame(width: 8, height: 8)

            // Tool icon
            Image(systemName: summary.icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Theme.accent)
                .frame(width: 16)

            // Tool-specific content
            toolContent(parsed: parsed, summary: summary)

            Spacer()

            // Chevron (optional) - rotates when expanded
            if showChevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.dim)
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

        case .ls(let path, let limit):
            lsContent(path: path, limit: limit)

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
                .foregroundColor(Theme.text)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.accent)
                .lineLimit(1)

            if let offset {
                Text(":\(offset)")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.warning)
                if let limit {
                    Text("-\(offset + limit - 1)")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(Theme.warning)
                }
            }
        }
    }

    private func filePathContent(label: String, path: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.accent)
                .lineLimit(1)
        }
    }

    private func bashContent(command: String) -> some View {
        HStack(spacing: 4) {
            Text("$")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)

            Text(command.isEmpty ? "..." : truncateCommand(command))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.muted)
                .lineLimit(1)
        }
    }

    private func lsContent(path: String, limit: Int?) -> some View {
        HStack(spacing: 4) {
            Text("ls")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.accent)
                .lineLimit(1)

            if let limit {
                Text("(\(limit))")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(Theme.dim)
            }
        }
    }

    private func searchContent(label: String, pattern: String, path: String, glob: String?) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)

            Text(pattern.isEmpty ? "..." : pattern)
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.accent)
                .lineLimit(1)

            Text("in")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Theme.dim)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Theme.muted)
                .lineLimit(1)

            if let glob {
                Text("(\(glob))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Theme.dim)
            }
        }
    }

    private func grepContent(pattern: String, path: String, glob: String?, literal: Bool) -> some View {
        HStack(spacing: 4) {
            Text("grep")
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)

            let patternDisplay = pattern.isEmpty ? "..." : (literal ? pattern : "/\(pattern)/")
            Text(patternDisplay)
                .font(.system(size: 13, design: .monospaced))
                .foregroundColor(Theme.accent)
                .lineLimit(1)

            Text("in")
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Theme.dim)

            Text(ToolCallSummary.shortenPath(path))
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(Theme.muted)
                .lineLimit(1)

            if let glob {
                Text("(\(glob))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Theme.dim)
            }
        }
    }

    private func unknownContent(name: String) -> some View {
        HStack(spacing: 4) {
            Text(name)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(Theme.text)
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
                .foregroundColor(Theme.dim)
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                Text(ToolOutputFormatter.prettyJSON(json) ?? json)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .textSelection(.enabled)
            }
            .padding(8)
            .background(Theme.pageBg)
            .cornerRadius(6)
        }
    }

    private func outputSection(output: String) -> some View {
        let preview = ToolOutputFormatter.preview(output, maxLines: maxPreviewLines)

        return VStack(alignment: .leading, spacing: 6) {
            Text("Output")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Theme.dim)
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(preview.lines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Theme.muted)
                    }

                    if preview.hasMore {
                        Text("... (\(preview.moreCount) more lines)")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Theme.dim)
                            .italic()
                    }
                }
                .textSelection(.enabled)
            }
            .frame(maxHeight: 200)
            .padding(8)
            .background(Theme.pageBg)
            .cornerRadius(6)
        }
    }
}

// MARK: - Tool Call Detail View (for iOS navigation)

/// Full detail view for a tool call - used on iOS for navigation
public struct ToolCallDetailView: View {
    public let toolName: String
    public let args: String?
    public let output: String?
    public let status: ToolCallStatus

    public init(
        toolName: String,
        args: String?,
        output: String?,
        status: ToolCallStatus
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
        .background(Theme.pageBg)
        .navigationTitle(parsed.toolType.label)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func headerCard(parsed: ParsedToolArgs, summary: ToolCallSummary) -> some View {
        HStack(spacing: 12) {
            // Icon
            ZStack {
                Circle()
                    .fill(Theme.toolStatusBg(status))
                    .frame(width: 44, height: 44)

                Image(systemName: summary.icon)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(Theme.toolStatusColor(status))
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(summary.title)
                    .font(.system(size: 15, weight: .medium, design: .monospaced))
                    .foregroundColor(Theme.text)
                    .lineLimit(2)

                if let subtitle = summary.subtitle {
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.muted)
                }

                // Status badge
                HStack(spacing: 4) {
                    Circle()
                        .fill(Theme.toolStatusColor(status))
                        .frame(width: 6, height: 6)
                    Text(status.displayName)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.toolStatusColor(status))
                }
            }

            Spacer()
        }
        .padding(16)
        .background(Theme.cardBg)
        .cornerRadius(12)
    }
}

// MARK: - ToolCallStatus Extension

extension ToolCallStatus {
    public var displayName: String {
        switch self {
        case .running: return "Running"
        case .success: return "Success"
        case .error: return "Error"
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
        .background(Theme.pageBg)
        .previewLayout(.sizeThatFits)
    }
}

struct ToolCallDetailView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationStack {
            ToolCallDetailView(
                toolName: "bash",
                args: "{\"command\": \"ls -la\", \"timeout\": 30}",
                output: "total 64\ndrwxr-xr-x  12 user  staff   384 Jan 19 10:00 .\ndrwxr-xr-x   6 user  staff   192 Jan 18 09:00 ..\n-rw-r--r--   1 user  staff  1234 Jan 19 10:00 main.swift",
                status: .success
            )
        }
    }
}
#endif
