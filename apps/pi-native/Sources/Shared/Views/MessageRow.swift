import SwiftUI

struct MessageRow: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(badgeColor)
                .frame(width: 28, height: 28)
                .overlay(
                    Text(badgeText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 6) {
                Text(roleLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(message.content)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.thinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.15), lineWidth: 1)
        )
    }

    private var badgeText: String {
        switch message.role {
        case .assistant:
            return "AI"
        case .user:
            return "ME"
        case .system:
            return "SYS"
        }
    }

    private var roleLabel: String {
        switch message.role {
        case .assistant:
            return "Assistant"
        case .user:
            return "You"
        case .system:
            return "System"
        }
    }

    private var badgeColor: Color {
        switch message.role {
        case .assistant:
            return .blue
        case .user:
            return .green
        case .system:
            return .gray
        }
    }
}
