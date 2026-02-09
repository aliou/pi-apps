import Foundation

extension Client {
    /// Parse REST session history entries into conversation items.
    /// Port of `clients/dashboard/app/lib/history.ts` `parseHistoryToConversation`.
    public static func parseHistory(_ entries: [Relay.AnyCodable]) -> [ConversationItem] {
        var items: [ConversationItem] = []
        var toolUseMap: [String: ToolUseInfo] = [:]

        for (index, entry) in entries.enumerated() {
            let id = entry["id"]?.stringValue ?? "entry-\(index)"
            let timestamp = entry["timestamp"]?.stringValue ?? ""
            let entryType = entry["type"]?.stringValue ?? ""

            switch entryType {
            case "session":
                // Header entry -- skip
                break

            case "message":
                parseMessageEntry(entry, id: id, timestamp: timestamp, items: &items, toolUseMap: &toolUseMap)

            case "compaction":
                parseCompactionEntry(entry, id: id, timestamp: timestamp, items: &items)

            case "model_change":
                parseModelChangeEntry(entry, id: id, timestamp: timestamp, items: &items)

            case "thinking_level_change":
                parseThinkingLevelChangeEntry(entry, id: id, timestamp: timestamp, items: &items)

            case "branch_summary":
                parseBranchSummaryEntry(entry, id: id, timestamp: timestamp, items: &items)

            default:
                // Unknown entry type -- skip
                break
            }
        }

        return items
    }

    // MARK: - Private Types

    private struct ToolUseInfo {
        let name: String
        let args: String
        let timestamp: String
    }

    // MARK: - Entry Parsers

    private static func parseMessageEntry(
        _ entry: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem],
        toolUseMap: inout [String: ToolUseInfo]
    ) {
        guard let msg = entry["message"] else { return }
        let role = msg["role"]?.stringValue ?? ""

        switch role {
        case "user":
            parseUserMessage(msg, id: id, timestamp: timestamp, items: &items)

        case "assistant":
            parseAssistantMessage(msg, id: id, timestamp: timestamp, items: &items, toolUseMap: &toolUseMap)

        case "tool", "toolResult":
            parseToolMessage(msg, items: &items)

        default:
            break
        }
    }

    private static func parseUserMessage(
        _ msg: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem]
    ) {
        let text = extractText(from: msg["content"])
        if !text.isEmpty {
            items.append(.user(UserMessageItem(id: id, text: text, timestamp: timestamp)))
        }
    }

    // swiftlint:disable:next cyclomatic_complexity function_body_length
    private static func parseAssistantMessage(
        _ msg: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem],
        toolUseMap: inout [String: ToolUseInfo]
    ) {
        let content = msg["content"]

        if let stringContent = content?.stringValue {
            let text = stringContent.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                items.append(.assistant(AssistantMessageItem(id: id, text: text, timestamp: timestamp)))
            }
            return
        }

        guard let blocks = content?.arrayValue else { return }

        var assistantParts: [String] = []
        var reasoningParts: [String] = []

        func flushAssistantParts(index: Int) {
            let text = assistantParts.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                assistantParts.removeAll(keepingCapacity: true)
                return
            }
            let itemId = assistantParts.count == 1 && index == 0 ? id : "\(id)-text-\(index)"
            items.append(.assistant(AssistantMessageItem(id: itemId, text: text, timestamp: timestamp)))
            assistantParts.removeAll(keepingCapacity: true)
        }

        func flushReasoningParts(index: Int) {
            let text = reasoningParts.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                reasoningParts.removeAll(keepingCapacity: true)
                return
            }
            items.append(.reasoning(ReasoningItem(
                id: "reasoning-\(id)-\(index)",
                text: text,
                timestamp: timestamp
            )))
            reasoningParts.removeAll(keepingCapacity: true)
        }

        for (index, block) in blocks.enumerated() {
            let type = block["type"]?.stringValue

            switch type {
            case "text":
                if !reasoningParts.isEmpty {
                    flushReasoningParts(index: index)
                }
                if let text = block["text"]?.stringValue {
                    assistantParts.append(text)
                }

            case "thinking":
                if !assistantParts.isEmpty {
                    flushAssistantParts(index: index)
                }
                if let reasoning = block["thinking"]?.stringValue ?? block["text"]?.stringValue {
                    reasoningParts.append(reasoning)
                }

            case "tool_use", "toolCall":
                if !assistantParts.isEmpty {
                    flushAssistantParts(index: index)
                }
                if !reasoningParts.isEmpty {
                    flushReasoningParts(index: index)
                }
                guard let toolId = block["id"]?.stringValue else { continue }
                let name = block["name"]?.stringValue ?? "unknown"
                let input = block["input"] ?? block["arguments"]
                let argsJSON = input.map { anyCodableToJSON($0) } ?? ""
                toolUseMap[toolId] = ToolUseInfo(name: name, args: argsJSON, timestamp: timestamp)
                items.append(.tool(ToolCallItem(
                    id: "tool-\(toolId)",
                    name: name,
                    argsJSON: argsJSON,
                    outputText: "",
                    status: .running,
                    timestamp: timestamp
                )))

            default:
                continue
            }
        }

        if !assistantParts.isEmpty {
            flushAssistantParts(index: blocks.count)
        }
        if !reasoningParts.isEmpty {
            flushReasoningParts(index: blocks.count)
        }
    }

    private static func parseToolMessage(
        _ msg: Relay.AnyCodable,
        items: inout [ConversationItem]
    ) {
        if let toolCallId = msg["toolCallId"]?.stringValue ?? msg["tool_use_id"]?.stringValue {
            let outputText = extractText(from: msg["content"])
            let isError = msg["isError"]?.boolValue ?? msg["is_error"]?.boolValue ?? false

            if let idx = items.lastIndex(where: { $0.id == "tool-\(toolCallId)" }) {
                if case .tool(var toolItem) = items[idx] {
                    toolItem.outputText = outputText
                    toolItem.status = isError ? .error : .success
                    items[idx] = .tool(toolItem)
                }
            } else {
                items.append(.tool(ToolCallItem(
                    id: "tool-\(toolCallId)",
                    name: msg["toolName"]?.stringValue ?? "unknown",
                    argsJSON: "",
                    outputText: outputText,
                    status: isError ? .error : .success,
                    timestamp: msg["timestamp"]?.stringValue ?? ""
                )))
            }
            return
        }

        guard let blocks = msg["content"]?.arrayValue else { return }

        for block in blocks {
            if block["type"]?.stringValue == "tool_result",
               let toolUseId = block["tool_use_id"]?.stringValue {
                let outputText = block["content"]?.arrayValue?
                    .compactMap { $0["text"]?.stringValue }
                    .joined(separator: "\n") ?? ""
                let isError = block["is_error"]?.boolValue ?? false

                if let idx = items.lastIndex(where: { $0.id == "tool-\(toolUseId)" }) {
                    if case .tool(var toolItem) = items[idx] {
                        toolItem.outputText = outputText
                        toolItem.status = isError ? .error : .success
                        items[idx] = .tool(toolItem)
                    }
                }
            }
        }
    }

    private static func parseCompactionEntry(
        _ entry: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem]
    ) {
        let summary = entry["summary"]?.stringValue ?? "Conversation compacted"
        let truncated = summary.count > 200
            ? "\(summary.prefix(200))..."
            : summary
        items.append(.system(SystemItem(
            id: id, text: "Compaction: \(truncated)", timestamp: timestamp
        )))
    }

    private static func parseModelChangeEntry(
        _ entry: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem]
    ) {
        let provider = entry["provider"]?.stringValue ?? ""
        let modelId = entry["modelId"]?.stringValue ?? ""
        items.append(.system(SystemItem(
            id: id, text: "Model changed to \(provider)/\(modelId)", timestamp: timestamp
        )))
    }

    private static func parseThinkingLevelChangeEntry(
        _ entry: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem]
    ) {
        let level = entry["thinkingLevel"]?.stringValue ?? ""
        items.append(.system(SystemItem(
            id: id, text: "Thinking level: \(level)", timestamp: timestamp
        )))
    }

    private static func parseBranchSummaryEntry(
        _ entry: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem]
    ) {
        let summary = entry["summary"]?.stringValue ?? "Branch summary available"
        let truncated = summary.count > 200
            ? "\(summary.prefix(200))..."
            : summary
        items.append(.system(SystemItem(
            id: id, text: "Branch: \(truncated)", timestamp: timestamp
        )))
    }

    // MARK: - Helpers

    /// Extract text from a message's content field (string or array of blocks).
    private static func extractText(from content: Relay.AnyCodable?) -> String {
        guard let content else { return "" }
        if let str = content.stringValue { return str }
        if let blocks = content.arrayValue {
            let text = blocks
                .filter { $0["type"]?.stringValue == "text" }
                .compactMap { $0["text"]?.stringValue }
                .joined(separator: "\n")
            if !text.isEmpty {
                return text
            }

            let hasThinking = blocks.contains { $0["type"]?.stringValue == "thinking" }
            if hasThinking {
                return "Thinking…"
            }
        }
        return ""
    }

    /// Convert an AnyCodable to a pretty-printed JSON string.
    private static func anyCodableToJSON(_ value: Relay.AnyCodable) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]),
              let str = String(data: pretty, encoding: .utf8) else {
            return ""
        }
        return str
    }
}
