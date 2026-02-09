import Foundation

extension Client {
    /// Reduces live WebSocket events into conversation item mutations.
    /// Port of `clients/dashboard/app/lib/conversation.ts` `parseEventsToConversation`.
    public struct EventReducer: Sendable {
        /// Id of the currently streaming assistant message, if any.
        public private(set) var activeAssistantId: String?
        /// Accumulated text for the current assistant message.
        private var activeAssistantText: String = ""

        public init() {}

        /// Process a single server event. Mutates the items array in place.
        public mutating func handle(
            _ event: Relay.ServerEvent,
            items: inout [ConversationItem],
            seq: Int
        ) {
            if handleMessageEvent(event, items: &items, seq: seq) { return }
            if handleToolEvent(event, items: &items) { return }
            EventReducerHelpers.handleSystemEvent(event, items: &items, seq: seq)
        }

        /// Returns true if the event was handled as a message event.
        private mutating func handleMessageEvent(
            _ event: Relay.ServerEvent,
            items: inout [ConversationItem],
            seq: Int
        ) -> Bool {
            switch event {
            case .agentEnd:
                flushAssistant(items: &items, streaming: false)
            case .messageStart:
                flushAssistant(items: &items, streaming: false)
                activeAssistantId = "assistant-\(seq)"
                activeAssistantText = ""
            case .messageUpdate(let message, let assistantMessageEvent):
                handleMessageUpdate(
                    message: message,
                    assistantMessageEvent: assistantMessageEvent,
                    items: &items,
                    seq: seq
                )
            case .messageEnd:
                flushAssistant(items: &items, streaming: false)
            default:
                return false
            }
            return true
        }

        /// Returns true if the event was handled as a tool event.
        private mutating func handleToolEvent(
            _ event: Relay.ServerEvent,
            items: inout [ConversationItem]
        ) -> Bool {
            switch event {
            case .toolExecutionStart(let toolCallId, let toolName, let args):
                handleToolStart(
                    toolCallId: toolCallId, toolName: toolName,
                    args: args, items: &items
                )
            case .toolExecutionUpdate(let id, _, _, let partialResult):
                EventReducerHelpers.applyToolUpdate(
                    toolCallId: id, partialResult: partialResult, items: &items
                )
            case .toolExecutionEnd(let id, _, let result, let isError):
                EventReducerHelpers.applyToolEnd(
                    toolCallId: id, result: result, isError: isError, items: &items
                )
            default:
                return false
            }
            return true
        }

        // MARK: - Message handling

        private mutating func handleMessageUpdate(
            message: Relay.AnyCodable,
            assistantMessageEvent: Relay.AnyCodable,
            items: inout [ConversationItem],
            seq: Int
        ) {
            if activeAssistantId == nil {
                activeAssistantId = "assistant-\(seq)"
                activeAssistantText = ""
            }

            let previousText = activeAssistantText

            // Delta accumulation
            if let evtType = assistantMessageEvent["type"]?.stringValue,
               evtType == "text_delta",
               let delta = assistantMessageEvent["delta"]?.stringValue {
                activeAssistantText += delta
            }

            // Full text from message.content (more reliable)
            if let text = EventReducerHelpers.extractTextContent(from: message) {
                activeAssistantText = text
            }

            // Avoid no-op writes that cause extra SwiftUI render churn
            guard activeAssistantText != previousText else { return }
            upsertActiveAssistant(items: &items, streaming: true)
        }

        // MARK: - Tool handling

        private mutating func handleToolStart(
            toolCallId: String,
            toolName: String,
            args: Relay.AnyCodable,
            items: inout [ConversationItem]
        ) {
            flushAssistant(items: &items, streaming: true)
            let argsJSON = EventReducerHelpers.anyCodableToJSON(args)
            items.append(.tool(ToolCallItem(
                id: "tool-\(toolCallId)",
                name: toolName,
                argsJSON: argsJSON,
                outputText: "",
                status: .running,
                timestamp: ISO8601DateFormatter().string(from: Date())
            )))
        }

        // MARK: - Assistant state

        private mutating func flushAssistant(items: inout [ConversationItem], streaming: Bool) {
            guard activeAssistantId != nil else { return }
            let text = activeAssistantText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                upsertActiveAssistant(items: &items, streaming: streaming)
            }
            if !streaming {
                activeAssistantId = nil
                activeAssistantText = ""
            }
        }

        private func upsertActiveAssistant(items: inout [ConversationItem], streaming: Bool) {
            guard let assistantId = activeAssistantId else { return }
            let text = activeAssistantText

            if let idx = items.lastIndex(where: { $0.id == assistantId }) {
                if case .assistant(var msg) = items[idx] {
                    msg.text = text
                    msg.isStreaming = streaming
                    items[idx] = .assistant(msg)
                }
            } else {
                items.append(.assistant(AssistantMessageItem(
                    id: assistantId,
                    text: text,
                    timestamp: ISO8601DateFormatter().string(from: Date()),
                    isStreaming: streaming
                )))
            }
        }
    }
}

// MARK: - Stateless helpers (outside struct to reduce type_body_length)

private enum EventReducerHelpers {
    static func handleSystemEvent(
        _ event: Relay.ServerEvent,
        items: inout [Client.ConversationItem],
        seq: Int
    ) {
        switch event {
        case .error(_, let message):
            appendSystem("Error: \(message)", items: &items, seq: seq)
        case .autoRetryStart(let attempt, let maxAttempts, _, let errorMessage):
            appendSystem(
                "Retrying (\(attempt)/\(maxAttempts)): \(errorMessage)",
                items: &items, seq: seq
            )
        case .autoCompactionStart(let reason):
            appendSystem("Compacting: \(reason)", items: &items, seq: seq)
        case .response(let command, let success, _, let error, _):
            if command == "prompt" && !success {
                let suffix = error.map { " - \($0)" } ?? ""
                appendSystem(
                    "Error: \(command) failed\(suffix)",
                    items: &items, seq: seq
                )
            }
        default:
            break
        }
    }

    static func extractTextContent(from message: Relay.AnyCodable) -> String? {
        guard let content = message["content"] else { return nil }
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
        return nil
    }

    static func applyToolUpdate(
        toolCallId: String,
        partialResult: Relay.AnyCodable,
        items: inout [Client.ConversationItem]
    ) {
        let toolId = "tool-\(toolCallId)"
        guard let idx = items.lastIndex(where: { $0.id == toolId }),
              case .tool(var toolItem) = items[idx] else { return }

        if let content = partialResult["content"]?.arrayValue {
            let text = content.compactMap { $0["text"]?.stringValue }.joined(separator: "\n")
            if !text.isEmpty { toolItem.outputText = text }
        }
        items[idx] = .tool(toolItem)
    }

    static func applyToolEnd(
        toolCallId: String,
        result: Relay.AnyCodable,
        isError: Bool,
        items: inout [Client.ConversationItem]
    ) {
        let toolId = "tool-\(toolCallId)"
        let outputText = result["content"]?.arrayValue?
            .compactMap { $0["text"]?.stringValue }
            .joined(separator: "\n") ?? ""

        if let idx = items.lastIndex(where: { $0.id == toolId }),
           case .tool(var toolItem) = items[idx] {
            toolItem.status = isError ? .error : .success
            toolItem.outputText = outputText
            items[idx] = .tool(toolItem)
        } else {
            items.append(.tool(Client.ToolCallItem(
                id: toolId,
                name: "",
                argsJSON: "",
                outputText: outputText,
                status: isError ? .error : .success,
                timestamp: ISO8601DateFormatter().string(from: Date())
            )))
        }
    }

    static func appendSystem(_ text: String, items: inout [Client.ConversationItem], seq: Int) {
        items.append(.system(Client.SystemItem(
            id: "system-\(seq)",
            text: text,
            timestamp: ISO8601DateFormatter().string(from: Date())
        )))
    }

    static func anyCodableToJSON(_ value: Relay.AnyCodable) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(
                  withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]
              ),
              let str = String(data: pretty, encoding: .utf8) else {
            return ""
        }
        return str
    }
}
