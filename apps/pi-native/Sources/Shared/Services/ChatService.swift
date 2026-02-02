import Foundation

protocol ChatService: Sendable {
    func send(message: ChatMessage, in session: ChatSession) async throws -> ChatMessage
}

actor LocalEchoChatService: ChatService {
    func send(message: ChatMessage, in session: ChatSession) async throws -> ChatMessage {
        let trimmed = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let responseText = trimmed.isEmpty ? "Give me something to respond to." : "Echo: \(trimmed)"
        return ChatMessage(role: .assistant, content: responseText)
    }
}
