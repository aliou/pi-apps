//
//  SessionFileParser.swift
//  pi
//
//  Parses pi session files (.jsonl) to extract conversation history
//

import Foundation

struct SessionFileParser {
    
    static func parse(fileAt path: String) -> [ConversationItem] {
        guard let data = FileManager.default.contents(atPath: path),
              let content = String(data: data, encoding: .utf8) else {
            return []
        }
        
        var items: [ConversationItem] = []
        var toolCallIndex: [String: Int] = [:]  // toolCallId -> index in items
        
        let lines = content.components(separatedBy: .newlines)
        
        for line in lines {
            guard !line.isEmpty,
                  let lineData = line.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any],
                  let type = json["type"] as? String else {
                continue
            }
            
            if type == "message", let message = json["message"] as? [String: Any] {
                parseMessage(message, into: &items, toolCallIndex: &toolCallIndex)
            }
        }
        
        return items
    }
    
    private static func parseMessage(
        _ message: [String: Any],
        into items: inout [ConversationItem],
        toolCallIndex: inout [String: Int]
    ) {
        guard let role = message["role"] as? String else { return }
        
        switch role {
        case "user":
            if let text = extractUserText(from: message), !text.isEmpty {
                items.append(.userMessage(id: UUID().uuidString, text: text))
            }
            
        case "assistant":
            if let contentArray = message["content"] as? [[String: Any]] {
                for block in contentArray {
                    guard let blockType = block["type"] as? String else { continue }
                    
                    switch blockType {
                    case "text":
                        if let text = block["text"] as? String, !text.isEmpty {
                            items.append(.assistantText(id: UUID().uuidString, text: text))
                        }
                    case "toolCall":
                        if let toolId = block["id"] as? String,
                           let toolName = block["name"] as? String {
                            let args = formatArguments(block["arguments"])
                            items.append(.toolCall(
                                id: toolId,
                                name: toolName,
                                args: args,
                                output: nil,
                                status: .running,
                                isExpanded: false
                            ))
                            toolCallIndex[toolId] = items.count - 1
                        }
                    default:
                        break
                    }
                }
            }
            
        case "toolResult":
            if let toolCallId = message["toolCallId"] as? String,
               let index = toolCallIndex[toolCallId],
               case .toolCall(let id, let name, let args, _, _, let isExpanded) = items[index] {
                let output = extractToolResultContent(message["content"])
                let isError = message["isError"] as? Bool ?? false
                items[index] = .toolCall(
                    id: id,
                    name: name,
                    args: args,
                    output: output,
                    status: isError ? .error : .success,
                    isExpanded: isExpanded
                )
            }
            
        default:
            break
        }
    }
    
    private static func extractUserText(from message: [String: Any]) -> String? {
        if let content = message["content"] as? String {
            return content
        }
        if let contentArray = message["content"] as? [[String: Any]] {
            return contentArray.compactMap { block -> String? in
                if block["type"] as? String == "text" {
                    return block["text"] as? String
                }
                return nil
            }.joined(separator: "\n")
        }
        return nil
    }
    
    private static func formatArguments(_ args: Any?) -> String? {
        guard let args = args else { return nil }
        
        if let dict = args as? [String: Any],
           let data = try? JSONSerialization.data(withJSONObject: dict, options: [.prettyPrinted, .sortedKeys]),
           let string = String(data: data, encoding: .utf8) {
            return string
        }
        
        if let string = args as? String {
            return string
        }
        
        return nil
    }
    
    private static func extractToolResultContent(_ content: Any?) -> String? {
        guard let content = content else { return nil }
        
        if let contentArray = content as? [[String: Any]] {
            return contentArray.compactMap { block -> String? in
                if block["type"] as? String == "text" {
                    return block["text"] as? String
                }
                return nil
            }.joined(separator: "\n")
        }
        
        if let string = content as? String {
            return string
        }
        
        return nil
    }
}
