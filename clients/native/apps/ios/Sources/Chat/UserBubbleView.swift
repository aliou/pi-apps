import SwiftUI
import PiCore

struct UserBubbleView: View {
    let message: Client.UserMessageItem

    var body: some View {
        HStack {
            Spacer(minLength: 60)
            Text(message.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.tint, in: .rect(cornerRadius: 18))
                .foregroundStyle(.white)
        }
        .opacity(message.sendStatus == .sending ? 0.6 : 1.0)
    }
}

#Preview("Sent") {
    UserBubbleView(
        message: Client.UserMessageItem(
            id: "u1",
            text: "Hello, how are you?",
            timestamp: "2025-01-01T00:00:00Z",
            sendStatus: .sent
        )
    )
    .padding()
}

#Preview("Sending") {
    UserBubbleView(
        message: Client.UserMessageItem(
            id: "u2",
            text: "This message is still sending...",
            timestamp: "2025-01-01T00:00:00Z",
            sendStatus: .sending
        )
    )
    .padding()
}
