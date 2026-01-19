//
//  ToolCallContentViews.swift
//  PiUI
//
//  Specialized content views for each tool type
//

import SwiftUI

// MARK: - Tool Call Expanded Content

/// Shared expanded content for tool calls - used in mobile detail view and desktop inline expansion
public struct ToolCallExpandedContent: View {
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

        VStack(alignment: .leading, spacing: 16) {
            // Tool-specific content
            switch parsed {
            case .read(let path, let offset, let limit):
                ReadToolContent(path: path, offset: offset, limit: limit, output: output)

            case .write(let path, let contentPreview):
                WriteToolContent(path: path, contentPreview: contentPreview, output: output)

            case .edit(let path, let oldText, let newText):
                EditToolContent(path: path, oldText: oldText, newText: newText, output: output)

            case .bash(let command, let timeout):
                BashToolContent(command: command, timeout: timeout, output: output, status: status)

            case .ls(let path, let limit):
                LSToolContent(path: path, limit: limit, output: output)

            case .find(let pattern, let path):
                FindToolContent(pattern: pattern, path: path, output: output)

            case .grep(let pattern, let path, let glob, let literal):
                GrepToolContent(pattern: pattern, path: path, glob: glob, literal: literal, output: output)

            case .unknown(let name, _):
                UnknownToolContent(name: name, args: args, output: output)
            }
        }
    }
}

// MARK: - Read Tool Content

struct ReadToolContent: View {
    let path: String
    let offset: Int?
    let limit: Int?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // File info
            DetailRow(label: "File", icon: "doc.text") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(2)
            }

            if let offset {
                DetailRow(label: "Range", icon: "number") {
                    if let limit {
                        Text("Lines \(offset) - \(offset + limit - 1)")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(Theme.warning)
                    } else {
                        Text("From line \(offset)")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(Theme.warning)
                    }
                }
            }

            // File content
            if let output, !output.isEmpty {
                OutputSection(title: "Content", output: output)
            }
        }
    }
}

// MARK: - Write Tool Content

struct WriteToolContent: View {
    let path: String
    let contentPreview: String?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "File", icon: "square.and.pencil") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(2)
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Result", output: output)
            }
        }
    }
}

// MARK: - Edit Tool Content

struct EditToolContent: View {
    let path: String
    let oldText: String?
    let newText: String?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "File", icon: "pencil.line") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(2)
            }

            // Diff preview
            if let oldText, let newText {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Changes")

                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .top, spacing: 8) {
                            Text("-")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundColor(Theme.diffRemoved)
                                .frame(width: 14)
                            Text(oldText)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(Theme.diffRemoved)
                                .lineLimit(3)
                        }

                        HStack(alignment: .top, spacing: 8) {
                            Text("+")
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundColor(Theme.diffAdded)
                                .frame(width: 14)
                            Text(newText)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(Theme.diffAdded)
                                .lineLimit(3)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.mdCodeBlockBg)
                    .cornerRadius(8)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Result", output: output)
            }
        }
    }
}

// MARK: - Bash Tool Content

struct BashToolContent: View {
    let command: String
    let timeout: Int?
    let output: String?
    let status: ToolCallStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Command display
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(title: "Command")

                HStack(alignment: .top, spacing: 8) {
                    Text("$")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(Theme.accent)

                    Text(command)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(Theme.text)
                        .textSelection(.enabled)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.mdCodeBlockBg)
                .cornerRadius(8)
            }

            if let timeout {
                DetailRow(label: "Timeout", icon: "clock") {
                    Text("\(timeout) seconds")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.muted)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(
                    title: status == .error ? "Error Output" : "Output",
                    output: output,
                    isError: status == .error
                )
            }
        }
    }
}

// MARK: - LS Tool Content

struct LSToolContent: View {
    let path: String
    let limit: Int?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "Directory", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(2)
            }

            if let limit {
                DetailRow(label: "Limit", icon: "number") {
                    Text("\(limit) items")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.muted)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Files", output: output)
            }
        }
    }
}

// MARK: - Find Tool Content

struct FindToolContent: View {
    let pattern: String
    let path: String
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "Pattern", icon: "magnifyingglass") {
                Text(pattern)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
            }

            DetailRow(label: "Search Path", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .lineLimit(2)
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Results", output: output)
            }
        }
    }
}

// MARK: - Grep Tool Content

struct GrepToolContent: View {
    let pattern: String
    let path: String
    let glob: String?
    let literal: Bool
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: literal ? "Text" : "Pattern", icon: "text.magnifyingglass") {
                HStack(spacing: 4) {
                    if !literal {
                        Text("/")
                            .foregroundColor(Theme.dim)
                    }
                    Text(pattern)
                        .foregroundColor(Theme.accent)
                    if !literal {
                        Text("/")
                            .foregroundColor(Theme.dim)
                    }
                }
                .font(.system(size: 13, design: .monospaced))
            }

            DetailRow(label: "Search Path", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .lineLimit(2)
            }

            if let glob {
                DetailRow(label: "File Filter", icon: "doc") {
                    Text(glob)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(Theme.warning)
                }
            }

            if literal {
                DetailRow(label: "Mode", icon: "textformat") {
                    Text("Literal match")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.dim)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Matches", output: output)
            }
        }
    }
}

// MARK: - Unknown Tool Content

struct UnknownToolContent: View {
    let name: String
    let args: String?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "Tool", icon: "gearshape") {
                Text(name)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(Theme.text)
            }

            // Arguments as syntax-highlighted JSON
            if let args, !args.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Arguments")

                    ScrollView(.horizontal, showsIndicators: false) {
                        SyntaxHighlightedJSON(ToolOutputFormatter.prettyJSON(args) ?? args)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.mdCodeBlockBg)
                    .cornerRadius(8)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Output", output: output)
            }
        }
    }
}

// MARK: - Helper Views

struct DetailRow<Content: View>: View {
    let label: String
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(Theme.dim)
                .frame(width: 16)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Theme.dim)
                .frame(width: 80, alignment: .leading)

            content()

            Spacer(minLength: 0)
        }
    }
}

struct SectionLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Theme.dim)
            .textCase(.uppercase)
    }
}

struct OutputSection: View {
    let title: String
    let output: String
    var isError: Bool = false
    var maxLines: Int = 50

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title: title)

            ScrollView {
                Text(output)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(isError ? Theme.error : Theme.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 300)
            .padding(10)
            .background(Theme.mdCodeBlockBg)
            .cornerRadius(8)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ToolCallContentViews_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Read tool
                ToolCallExpandedContent(
                    toolName: "read",
                    args: "{\"path\": \"src/main.swift\", \"offset\": 10, \"limit\": 50}",
                    output: "import Foundation\n\nclass App {\n    func run() {\n        print(\"Hello\")\n    }\n}",
                    status: .success
                )

                Divider()

                // Bash tool
                ToolCallExpandedContent(
                    toolName: "bash",
                    args: "{\"command\": \"npm run build && npm test\", \"timeout\": 30}",
                    output: "> build\nCompiling...\nDone in 2.3s",
                    status: .success
                )

                Divider()

                // Unknown tool
                ToolCallExpandedContent(
                    toolName: "custom_tool",
                    args: "{\"foo\": \"bar\", \"count\": 42, \"enabled\": true, \"items\": [1, 2, 3]}",
                    output: "Custom output here",
                    status: .success
                )
            }
            .padding()
        }
        .background(Theme.pageBg)
        .previewLayout(.sizeThatFits)
    }
}
#endif
