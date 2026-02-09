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
