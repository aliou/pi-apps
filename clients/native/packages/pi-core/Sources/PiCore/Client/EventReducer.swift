import Foundation

// swiftlint:disable file_length
extension Client {
    /// Reduces live WebSocket events into conversation item mutations.
    /// Port of `clients/dashboard/app/lib/conversation.ts` `parseEventsToConversation`.
    public struct EventReducer: Sendable {
        /// Id of the currently streaming assistant message, if any.
        public private(set) var activeAssistantId: String?
        /// Accumulated text for the current assistant message.
        private var activeAssistantText: String = ""
        /// Id of the currently streaming reasoning item, if any.
        public private(set) var activeReasoningId: String?
        /// Accumulated reasoning text for the current turn.
        private var activeReasoningText: String = ""

        public init() {}

        // swiftlint:disable cyclomatic_complexity function_body_length
        /// Process a single server event. Mutates the items array in place.
        ///
        /// Intentionally exhaustive: every known event type must be handled
        /// (rendered, ignored, or warned) explicitly.
        public mutating func handle(
            _ event: Relay.ServerEvent,
            items: inout [ConversationItem],
            seq: Int
        ) {
            switch event {
            // Relay lifecycle
            case .connected, .replayStart, .replayEnd, .sandboxStatus:
                // Intentionally hidden from conversation transcript.
                break

            case .error(_, let message):
                EventReducerHelpers.appendSystem("Error: \(message)", items: &items, seq: seq)

            // Agent lifecycle
            case .agentStart:
                // Intentionally hidden from transcript.
                break

            case .agentEnd:
                flushAssistant(items: &items, streaming: false)
                flushReasoning(items: &items, streaming: false)

            // Turn lifecycle
            case .turnStart:
                // Intentionally hidden from transcript.
                break

            case .turnEnd:
                // Intentionally hidden from transcript.
                break

            // Message streaming
            case .messageStart:
                flushAssistant(items: &items, streaming: false)
                flushReasoning(items: &items, streaming: false)
                activeAssistantId = "assistant-\(seq)"
                activeAssistantText = ""
                activeReasoningId = "reasoning-\(seq)"
                activeReasoningText = ""

            case .messageUpdate(let message, let assistantMessageEvent):
                handleMessageUpdate(
                    message: message,
                    assistantMessageEvent: assistantMessageEvent,
                    items: &items,
                    seq: seq
                )

            case .messageEnd:
                flushAssistant(items: &items, streaming: false)
                flushReasoning(items: &items, streaming: false)

            // Tool execution
            case .toolExecutionStart(let toolCallId, let toolName, let args):
                handleToolStart(
                    toolCallId: toolCallId,
                    toolName: toolName,
                    args: args,
                    items: &items
                )

            case .toolExecutionUpdate(let id, _, _, let partialResult):
                EventReducerHelpers.applyToolUpdate(
                    toolCallId: id,
                    partialResult: partialResult,
                    items: &items
                )

            case .toolExecutionEnd(let id, _, let result, let isError):
                EventReducerHelpers.applyToolEnd(
                    toolCallId: id,
                    result: result,
                    isError: isError,
                    items: &items
                )

            // Compaction + retry
            case .autoCompactionStart(let reason):
                EventReducerHelpers.appendSystem("Compacting: \(reason)", items: &items, seq: seq)

            case .autoCompactionEnd:
                // Intentionally hidden from transcript.
                break

            case .autoRetryStart(let attempt, let maxAttempts, _, let errorMessage):
                EventReducerHelpers.appendSystem(
                    "Retrying (\(attempt)/\(maxAttempts)): \(errorMessage)",
                    items: &items,
                    seq: seq
                )

            case .autoRetryEnd:
                // Intentionally hidden from transcript.
                break

            // Extensions
            case .extensionError(let extensionPath, let event, let error):
                EventReducerHelpers.appendSystem(
                    "Extension error (\(extensionPath), \(event)): \(error)",
                    items: &items,
                    seq: seq
                )

            case .extensionUIRequest:
                // Intentionally hidden from transcript.
                break

            // RPC responses
            case .response(let command, let success, _, let error, _):
                if command == "prompt" && !success {
                    let suffix = error.map { " - \($0)" } ?? ""
                    EventReducerHelpers.appendSystem(
                        "Error: \(command) failed\(suffix)",
                        items: &items,
                        seq: seq
                    )
                }

            // Forward compatibility (+ journal-only events like `prompt`).
            case .unknown(let type, let payload):
                if type == "prompt" {
                    EventReducerHelpers.appendUserPromptIfPresent(payload, items: &items, seq: seq)
                } else {
                    EventReducerHelpers.warnUnhandledEventType(type)
                }
            }
        }
        // swiftlint:enable cyclomatic_complexity function_body_length

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
            if activeReasoningId == nil {
                activeReasoningId = "reasoning-\(seq)"
                activeReasoningText = ""
            }

            let previousText = activeAssistantText
            let previousReasoningText = activeReasoningText

            // Delta accumulation
            if let evtType = assistantMessageEvent["type"]?.stringValue,
               evtType == "text_delta",
               let delta = assistantMessageEvent["delta"]?.stringValue {
                activeAssistantText += delta
            }

            // Full text from message.content (more reliable)
            let extracted = EventReducerHelpers.extractMessageContent(from: message)
            if let text = extracted.text {
                activeAssistantText = text
            }
            if let reasoning = extracted.reasoning {
                activeReasoningText = reasoning
            }

            if activeAssistantText != previousText {
                upsertActiveAssistant(items: &items, streaming: true)
            }
            if activeReasoningText != previousReasoningText {
                upsertActiveReasoning(items: &items, streaming: true)
            }
        }

        // MARK: - Tool handling

        private mutating func handleToolStart(
            toolCallId: String,
            toolName: String,
            args: Relay.AnyCodable,
            items: inout [ConversationItem]
        ) {
            flushAssistant(items: &items, streaming: true)
            flushReasoning(items: &items, streaming: true)
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

        // MARK: - Assistant and reasoning state

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

        private mutating func flushReasoning(items: inout [ConversationItem], streaming: Bool) {
            guard activeReasoningId != nil else { return }
            let text = activeReasoningText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                upsertActiveReasoning(items: &items, streaming: streaming)
            }
            if !streaming {
                activeReasoningId = nil
                activeReasoningText = ""
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

        private func upsertActiveReasoning(items: inout [ConversationItem], streaming: Bool) {
            guard let reasoningId = activeReasoningId else { return }
            let text = activeReasoningText

            if let idx = items.lastIndex(where: { $0.id == reasoningId }) {
                if case .reasoning(var msg) = items[idx] {
                    msg.text = text
                    msg.isStreaming = streaming
                    items[idx] = .reasoning(msg)
                }
            } else {
                items.append(.reasoning(ReasoningItem(
                    id: reasoningId,
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
    static func extractMessageContent(from message: Relay.AnyCodable) -> (text: String?, reasoning: String?) {
        guard let content = message["content"] else { return (nil, nil) }
        if let str = content.stringValue { return (str, nil) }
        if let blocks = content.arrayValue {
            let text = blocks
                .filter {
                    let type = $0["type"]?.stringValue
                    return type == "text" || type == "output_text"
                }
                .compactMap { $0["text"]?.stringValue }
                .joined(separator: "\n")

            let reasoning = blocks
                .filter {
                    let type = $0["type"]?.stringValue
                    return type == "thinking" || type == "reasoning"
                }
                .compactMap {
                    $0["thinking"]?.stringValue
                        ?? $0["text"]?.stringValue
                        ?? $0["summary"]?.arrayValue?.compactMap({ $0["text"]?.stringValue }).joined(separator: "\n")
                }
                .joined(separator: "\n")

            return (
                text.isEmpty ? nil : text,
                reasoning.isEmpty ? nil : reasoning
            )
        }
        return (nil, nil)
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

    static func appendUserPromptIfPresent(
        _ payload: Relay.AnyCodable,
        items: inout [Client.ConversationItem],
        seq: Int
    ) {
        guard let text = payload["message"]?.stringValue,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        let id = payload["id"]?.stringValue ?? "user-\(seq)"
        items.append(.user(Client.UserMessageItem(
            id: id,
            text: text,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            sendStatus: .sent
        )))
    }

    static func warnUnhandledEventType(_ type: String) {
        #if DEBUG
        assertionFailure("Unhandled Relay.ServerEvent type: \(type)")
        #endif
        print("[EventReducer] Unhandled Relay.ServerEvent type: \(type)")
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
// swiftlint:enable file_length
