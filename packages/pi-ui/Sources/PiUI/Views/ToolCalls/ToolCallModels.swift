//
//  ToolCallModels.swift
//  PiUI
//
//  Shared models and formatting for tool call display
//

import Foundation

// MARK: - Tool Types

/// Known tool types with specialized display
public enum ToolType: String, CaseIterable, Sendable {
    case read
    case write
    case edit
    case bash
    case ls
    case find
    case grep
    case unknown

    public init(name: String) {
        self = Self(rawValue: name) ?? .unknown
    }

    /// SF Symbol name for this tool
    public var iconName: String {
        switch self {
        case .read: return "doc.text"
        case .write: return "square.and.pencil"
        case .edit: return "pencil.line"
        case .bash: return "terminal"
        case .ls: return "folder"
        case .find: return "doc.text.magnifyingglass"
        case .grep: return "text.magnifyingglass"
        case .unknown: return "gearshape"
        }
    }

    /// Display label for the tool
    public var label: String {
        switch self {
        case .read: return "Read"
        case .write: return "Write"
        case .edit: return "Edit"
        case .bash: return "Bash"
        case .ls: return "List"
        case .find: return "Find"
        case .grep: return "Grep"
        case .unknown: return "Tool"
        }
    }
}

// MARK: - Parsed Tool Args

/// Parsed arguments for known tool types
public enum ParsedToolArgs: Sendable {
    case read(path: String, offset: Int?, limit: Int?)
    case write(path: String, contentPreview: String?)
    case edit(path: String, oldTextPreview: String?, newTextPreview: String?)
    case bash(command: String, timeout: Int?)
    case ls(path: String, limit: Int?)
    case find(pattern: String, path: String)
    case grep(pattern: String, path: String, glob: String?, literal: Bool)
    case unknown(name: String, rawJSON: String?)

    public init(toolName: String, argsJSON: String?) {
        let args = Self.parseJSON(argsJSON)
        let toolType = ToolType(name: toolName)

        switch toolType {
        case .read:
            self = .read(
                path: args["path"] as? String ?? "",
                offset: args["offset"] as? Int,
                limit: args["limit"] as? Int
            )

        case .write:
            let content = args["content"] as? String
            self = .write(
                path: args["path"] as? String ?? "",
                contentPreview: content.map { Self.truncate($0, maxLength: 100) }
            )

        case .edit:
            let oldText = args["oldText"] as? String
            let newText = args["newText"] as? String
            self = .edit(
                path: args["path"] as? String ?? "",
                oldTextPreview: oldText.map { Self.truncate($0, maxLength: 50) },
                newTextPreview: newText.map { Self.truncate($0, maxLength: 50) }
            )

        case .bash:
            self = .bash(
                command: args["command"] as? String ?? "",
                timeout: args["timeout"] as? Int
            )

        case .ls:
            self = .ls(
                path: args["path"] as? String ?? ".",
                limit: args["limit"] as? Int
            )

        case .find:
            self = .find(
                pattern: args["pattern"] as? String ?? "",
                path: args["path"] as? String ?? "."
            )

        case .grep:
            self = .grep(
                pattern: args["pattern"] as? String ?? "",
                path: args["path"] as? String ?? ".",
                glob: args["glob"] as? String,
                literal: args["literal"] as? Bool ?? false
            )

        case .unknown:
            self = .unknown(name: toolName, rawJSON: argsJSON)
        }
    }

    public var toolType: ToolType {
        switch self {
        case .read: return .read
        case .write: return .write
        case .edit: return .edit
        case .bash: return .bash
        case .ls: return .ls
        case .find: return .find
        case .grep: return .grep
        case .unknown: return .unknown
        }
    }

    // MARK: - Helpers

    private static func parseJSON(_ json: String?) -> [String: Any] {
        guard let json,
              let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return dict
    }

    private static func truncate(_ text: String, maxLength: Int) -> String {
        let cleaned = text.replacingOccurrences(of: "\n", with: " ")
        if cleaned.count > maxLength {
            return String(cleaned.prefix(maxLength)) + "..."
        }
        return cleaned
    }
}

// MARK: - Tool Call Summary

/// Generates a one-line summary for a tool call
public struct ToolCallSummary: Sendable {
    public let icon: String
    public let title: String
    public let subtitle: String?
    public let badge: String?

    public init(args: ParsedToolArgs) {
        self.icon = args.toolType.iconName

        switch args {
        case .read(let path, let offset, let limit):
            self.title = Self.shortenPath(path)
            if let offset {
                if let limit {
                    self.subtitle = "lines \(offset)-\(offset + limit - 1)"
                } else {
                    self.subtitle = "from line \(offset)"
                }
            } else {
                self.subtitle = nil
            }
            self.badge = nil

        case .write(let path, _):
            self.title = Self.shortenPath(path)
            self.subtitle = nil
            self.badge = nil

        case .edit(let path, _, _):
            self.title = Self.shortenPath(path)
            self.subtitle = nil
            self.badge = nil

        case .bash(let command, let timeout):
            self.title = Self.truncateCommand(command)
            self.subtitle = nil
            self.badge = timeout.map { "\($0)s" }

        case .ls(let path, let limit):
            self.title = Self.shortenPath(path)
            self.subtitle = nil
            self.badge = limit.map { "limit \($0)" }

        case .find(let pattern, let path):
            self.title = pattern.isEmpty ? "..." : pattern
            self.subtitle = "in \(Self.shortenPath(path))"
            self.badge = nil

        case .grep(let pattern, let path, let glob, let literal):
            let patternDisplay = literal ? pattern : "/\(pattern)/"
            self.title = pattern.isEmpty ? "..." : patternDisplay
            self.subtitle = "in \(Self.shortenPath(path))"
            self.badge = glob

        case .unknown(let name, _):
            self.title = name
            self.subtitle = nil
            self.badge = nil
        }
    }

    // MARK: - Path Formatting

    public static func shortenPath(_ path: String) -> String {
        if path.isEmpty { return "..." }

        // Replace home directory
        #if os(macOS)
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var shortened = path
        if shortened.hasPrefix(home) {
            shortened = "~" + shortened.dropFirst(home.count)
        }
        #else
        var shortened = path
        #endif

        // If still too long, show last 2 components
        let components = shortened.components(separatedBy: "/")
        if components.count > 4 && shortened.count > 40 {
            return ".../" + components.suffix(2).joined(separator: "/")
        }

        return shortened
    }

    private static func truncateCommand(_ command: String) -> String {
        let cleaned = command.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "  ", with: " ")

        if cleaned.count > 50 {
            return String(cleaned.prefix(50)) + "..."
        }
        return cleaned
    }
}

// MARK: - Output Formatting

public struct ToolOutputFormatter {
    /// Format output for preview (limited lines)
    public static func preview(_ output: String?, maxLines: Int = 10) -> (lines: [String], hasMore: Bool, moreCount: Int) {
        guard let output, !output.isEmpty else {
            return ([], false, 0)
        }

        let allLines = output.components(separatedBy: .newlines)
        let previewLines = Array(allLines.prefix(maxLines))
        let remaining = allLines.count - maxLines

        return (previewLines, remaining > 0, max(0, remaining))
    }

    /// Format JSON for display
    public static func prettyJSON(_ json: String?) -> String? {
        guard let json,
              let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]),
              let string = String(data: pretty, encoding: .utf8) else {
            return json
        }
        return string
    }
}
