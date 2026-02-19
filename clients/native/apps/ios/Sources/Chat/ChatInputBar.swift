import SwiftUI

struct ChatInputBar: View {
    @Binding var text: String
    let isAgentRunning: Bool
    let onSend: () -> Void
    let onStop: () -> Void

    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message...", text: $text)
                .accessibilityIdentifier("chat-input")
                .textFieldStyle(.plain)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .focused($isFocused)
                .submitLabel(.send)
                .onSubmit {
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !isAgentRunning, !trimmed.isEmpty else { return }
                    onSend()
                }

            if isAgentRunning {
                Button {
                    onStop()
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.red)
                }
            } else {
                Button {
                    onSend()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .accessibilityIdentifier("send-button")
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

#Preview("Idle") {
    @Previewable @State var text = "Hello, how can I help?"

    ChatInputBar(
        text: $text,
        isAgentRunning: false,
        onSend: {},
        onStop: {}
    )
}

#Preview("Agent Running") {
    @Previewable @State var text = "What is the weather?"

    ChatInputBar(
        text: $text,
        isAgentRunning: true,
        onSend: {},
        onStop: {}
    )
}
