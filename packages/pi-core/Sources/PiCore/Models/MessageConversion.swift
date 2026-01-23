//
//  MessageConversion.swift
//  PiCore
//
//  Converts RPC Message arrays to ConversationItem arrays for UI display
//

import Foundation

extension Array where Element == Message {
    /// Convert RPC messages to conversation items for UI display
    public func toConversationItems() -> [ConversationItem] {
        var items: [ConversationItem] = []

        // First pass: collect tool results by toolCallId
        var toolResults: [String: String] = [:]
        for message in self where message.role == .tool || message.role == .toolResult {
            if let toolCallId = message.toolCallId, let content = message.content {
                let output = content.extractText()
                if !output.isEmpty {
                    toolResults[toolCallId] = output
                }
            }
        }

        // Second pass: build conversation items
        for message in self {
            switch message.role {
            case .user:
                if let content = message.content {
                    let text = content.extractText()
                    if !text.isEmpty {
                        items.append(.userMessage(id: message.id, text: text, queuedBehavior: nil))
                    }
                }

            case .assistant:
                if let content = message.content {
                    switch content {
                    case .text(let text):
                        if !text.isEmpty {
                            items.append(.assistantText(id: message.id, text: text))
                        }

                    case .structured(let blocks):
                        var textParts: [String] = []
                        var blockIndex = 0

                        for block in blocks {
                            switch block.type {
                            case .text:
                                if let text = block.text, !text.isEmpty {
                                    textParts.append(text)
                                }

                            case .toolUse, .toolCall:
                                // Flush accumulated text before tool call
                                if !textParts.isEmpty {
                                    let combinedText = textParts.joined(separator: "\n")
                                    let textId = "\(message.id)-text-\(blockIndex)"
                                    items.append(.assistantText(id: textId, text: combinedText))
                                    textParts = []
                                }

                                if let toolCallId = block.toolCallId, let toolName = block.toolName {
                                    let argsString = block.input?.jsonString
                                    let output = toolResults[toolCallId]
                                    items.append(.toolCall(
                                        id: toolCallId,
                                        name: toolName,
                                        args: argsString,
                                        output: output,
                                        status: .success
                                    ))
                                }

                            case .thinking, .toolResult:
                                break
                            }
                            blockIndex += 1
                        }

                        // Flush remaining text
                        if !textParts.isEmpty {
                            let combinedText = textParts.joined(separator: "\n")
                            let textId = "\(message.id)-text-final"
                            items.append(.assistantText(id: textId, text: combinedText))
                        }
                    }
                }

            case .system, .tool, .toolResult:
                break
            }
        }

        return items
    }
}

// MARK: - MessageContent Text Extraction

extension MessageContent {
    /// Extract plain text from message content
    public func extractText() -> String {
        switch self {
        case .text(let text):
            return text
        case .structured(let blocks):
            return blocks.compactMap { block -> String? in
                if block.type == .text {
                    return block.text
                }
                return nil
            }.joined(separator: "\n")
        }
    }
}
