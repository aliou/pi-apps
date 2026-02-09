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

        case "tool":
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

    private static func parseAssistantMessage(
        _ msg: Relay.AnyCodable,
        id: String,
        timestamp: String,
        items: inout [ConversationItem],
        toolUseMap: inout [String: ToolUseInfo]
    ) {
        let content = msg["content"]
        var textParts: [String] = []

        if let stringContent = content?.stringValue {
            textParts.append(stringContent)
        } else if let blocks = content?.arrayValue {
            for block in blocks {
                if block["type"]?.stringValue == "text",
                   let text = block["text"]?.stringValue {
                    textParts.append(text)
                } else if block["type"]?.stringValue == "tool_use",
                          let toolId = block["id"]?.stringValue {
                    let name = block["name"]?.stringValue ?? "unknown"
                    let input = block["input"]
                    let argsJSON = input.map { anyCodableToJSON($0) } ?? ""
                    toolUseMap[toolId] = ToolUseInfo(name: name, args: argsJSON, timestamp: timestamp)
                }
            }
        }

        let text = textParts.joined(separator: "\n")
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(.assistant(AssistantMessageItem(
                id: id, text: text, timestamp: timestamp
            )))
        }

        // Emit tool items for tool_use blocks
        if let blocks = content?.arrayValue {
            for block in blocks {
                if block["type"]?.stringValue == "tool_use",
                   let toolId = block["id"]?.stringValue {
                    let name = block["name"]?.stringValue ?? "unknown"
                    let input = block["input"]
                    let argsJSON = input.map { anyCodableToJSON($0) } ?? ""
                    items.append(.tool(ToolCallItem(
                        id: "tool-\(toolId)",
                        name: name,
                        argsJSON: argsJSON,
                        outputText: "",
                        status: .success,
                        timestamp: timestamp
                    )))
                }
            }
        }
    }

    private static func parseToolMessage(
        _ msg: Relay.AnyCodable,
        items: inout [ConversationItem]
    ) {
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
            return blocks
                .filter { $0["type"]?.stringValue == "text" }
                .compactMap { $0["text"]?.stringValue }
                .joined(separator: "\n")
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
