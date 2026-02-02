import Foundation
import SwiftUI

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var draft: String = ""
    @Published var statusText: String = "Ready"

    init() {
        let welcome = ChatMessage(
            role: .system,
            content: "Welcome to Pi Native. This preview focuses on agent UX, streaming-ready layout, and Liquid Glass styling."
        )
        messages = [welcome]
    }

    func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let userMessage = ChatMessage(role: .user, content: trimmed)
        messages.append(userMessage)
        draft = ""
        statusText = "Thinking…"

        Task { @MainActor in
            try? await Task.sleep(for: .seconds(0.7))
            let response = ChatMessage(
                role: .assistant,
                content: "This is a placeholder response. Wire me to the relay or a local model."
            )
            messages.append(response)
            statusText = "Ready"
        }
    }
}
