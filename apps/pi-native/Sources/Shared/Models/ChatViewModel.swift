import Foundation

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var session: ChatSession
    @Published private(set) var messages: [ChatMessage]
    @Published var inputText: String
    @Published var isSending: Bool

    private let service: ChatService

    init(service: ChatService) {
        self.service = service
        self.session = ChatSession.fresh()
        self.messages = [
            ChatMessage(role: .system, content: "Welcome to Pi Native."),
            ChatMessage(role: .assistant, content: "Ask me about your project, and I will help.")
        ]
        self.inputText = ""
        self.isSending = false
    }

    func resetSession() {
        session = ChatSession.fresh()
        messages.removeAll()
        messages.append(ChatMessage(role: .system, content: "New session started."))
        inputText = ""
    }

    func sendMessage() async {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = ChatMessage(role: .user, content: trimmed)
        messages.append(userMessage)
        inputText = ""
        isSending = true

        do {
            let response = try await service.send(message: userMessage, in: session)
            messages.append(response)
        } catch {
            messages.append(ChatMessage(role: .assistant, content: "Something went wrong. Please try again."))
        }

        isSending = false
    }
}
