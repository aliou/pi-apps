//
//  ToolCallContentViews.swift
//  PiUI
//
//  Specialized content views for each tool type
//
// swiftlint:disable file_length

import SwiftUI
import PiCore

// MARK: - Tool Call Expanded Content

/// Shared expanded content for tool calls - used in mobile detail view and desktop inline expansion
public struct ToolCallExpandedContent: View {
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

        VStack(alignment: .leading, spacing: 16) {
            // Tool-specific content
            switch parsed {
            case .read(let path, let offset, let limit):
                ReadToolContent(path: path, offset: offset, limit: limit, output: output)

            case .write(let path, _):
                WriteToolContent(
                    path: path,
                    content: argString("content"),
                    output: output
                )

            case .edit(let path, _, _):
                EditToolContent(
                    path: path,
                    oldText: argString("oldText"),
                    newText: argString("newText"),
                    output: output
                )

            case .bash(let command, let timeout):
                BashToolContent(command: command, timeout: timeout, output: output, status: status)

            case .list(let path, let limit):
                ListToolContent(path: path, limit: limit, output: output)

            case .find(let pattern, let path):
                FindToolContent(pattern: pattern, path: path, output: output)

            case .grep(let pattern, let path, let glob, let literal):
                GrepToolContent(pattern: pattern, path: path, glob: glob, literal: literal, output: output)

            case .unknown(let name, _):
                UnknownToolContent(name: name, args: args, output: output)
            }
        }
    }

    private func argString(_ key: String) -> String? {
        guard let args,
              let data = args.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return dict[key] as? String
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
                    .foregroundColor(.teal)
                    .lineLimit(2)
            }

            if let offset {
                DetailRow(label: "Range", icon: "number") {
                    if let limit {
                        Text("Lines \(offset) - \(offset + limit - 1)")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.yellow)
                    } else {
                        Text("From line \(offset)")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.yellow)
                    }
                }
            }

            // File content
            if let output, !output.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Content")

                    CodeView(code: output, language: inferredLanguage)
                        .frame(minHeight: 140, maxHeight: 320)
                        .padding(10)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(8)
                }
            }
        }
    }

    private var inferredLanguage: String? {
        DiffParser.languageFromFileName(path)
    }
}

// MARK: - Write Tool Content

struct WriteToolContent: View {
    let path: String
    let content: String?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "File", icon: "square.and.pencil") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.teal)
                    .lineLimit(2)
            }

            if let content, !content.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Content")
                    CodeView(code: content, language: DiffParser.languageFromFileName(path))
                        .frame(minHeight: 120, maxHeight: 260)
                        .padding(10)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(8)
                }
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
                    .foregroundColor(.teal)
                    .lineLimit(2)
            }

            if let oldText, let newText {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Changes")

                    DiffView(
                        patches: [
                            DiffPatchInput(
                                patch: unifiedPatch(oldText: oldText, newText: newText),
                                filename: path,
                                language: DiffParser.languageFromFileName(path)
                            )
                        ]
                    )
                    .frame(minHeight: 180, maxHeight: 320)
                    .background(Color.gray.opacity(0.1), in: .rect(cornerRadius: 8))
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Result", output: output)
            }
        }
    }

    private func unifiedPatch(oldText: String, newText: String) -> String {
        let oldLines = oldText.components(separatedBy: "\n")
        let newLines = newText.components(separatedBy: "\n")

        var patch: [String] = []
        patch.append("--- a/\(path)")
        patch.append("+++ b/\(path)")
        patch.append("@@ -1,\(max(1, oldLines.count)) +1,\(max(1, newLines.count)) @@")

        for line in oldLines {
            patch.append("-\(line)")
        }
        for line in newLines {
            patch.append("+\(line)")
        }

        return patch.joined(separator: "\n")
    }
}

// MARK: - Bash Tool Content

struct BashToolContent: View {
    let command: String
    let timeout: Int?
    let output: String?
    let status: Client.ToolCallStatus

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Command display
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(title: "Command")

                HStack(alignment: .top, spacing: 8) {
                    Text("$")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.teal)

                    Text(command)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(.primary)
                        .textSelection(.enabled)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(8)
            }

            if let timeout {
                DetailRow(label: "Timeout", icon: "clock") {
                    Text("\(timeout) seconds")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
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

// MARK: - List Tool Content

struct ListToolContent: View {
    let path: String
    let limit: Int?
    let output: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailRow(label: "Directory", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.teal)
                    .lineLimit(2)
            }

            if let limit {
                DetailRow(label: "Limit", icon: "number") {
                    Text("\(limit) items")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
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
                    .foregroundColor(.teal)
            }

            DetailRow(label: "Search Path", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.secondary)
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
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                    Text(pattern)
                        .foregroundColor(.teal)
                    if !literal {
                        Text("/")
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                }
                .font(.system(size: 13, design: .monospaced))
            }

            DetailRow(label: "Search Path", icon: "folder") {
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            if let glob {
                DetailRow(label: "File Filter", icon: "doc") {
                    Text(glob)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(.yellow)
                }
            }

            if literal {
                DetailRow(label: "Mode", icon: "textformat") {
                    Text("Literal match")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary.opacity(0.6))
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
                    .foregroundColor(.primary)
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
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(8)
                }
            }

            if let output, !output.isEmpty {
                OutputSection(title: "Output", output: output)
            }
        }
    }
}
