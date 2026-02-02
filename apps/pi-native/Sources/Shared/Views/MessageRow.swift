import SwiftUI

struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .assistant {
                bubble
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                bubble
            }
        }
    }

    private var bubble: some View {
        Text(message.content)
            .font(.body)
            .foregroundStyle(message.role == .user ? .black : .white)
            .padding(12)
            .background(bubbleBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var bubbleBackground: some ShapeStyle {
        switch message.role {
        case .user:
            return AnyShapeStyle(Color.white.opacity(0.85))
        case .assistant:
            return AnyShapeStyle(Color.blue.opacity(0.4))
        case .system:
            return AnyShapeStyle(Color.gray.opacity(0.35))
        }
    }
}
