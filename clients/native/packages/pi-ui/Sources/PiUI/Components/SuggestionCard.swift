import SwiftUI

/// Tappable card for prompt suggestions. Uses glassEffect on iOS 26 / macOS 26.
public struct SuggestionCard: View {
    let title: String
    let icon: String
    let action: () -> Void

    public init(title: String, icon: String, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive())
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview("Single card") {
    SuggestionCard(title: "Add a feature", icon: "sparkles", action: { })
        .padding()
}

#Preview("Multiple cards in grid") {
    VStack(spacing: 8) {
        SuggestionCard(title: "Refactor code", icon: "fixit", action: { })
        SuggestionCard(title: "Add tests", icon: "checkmark.square", action: { })
        SuggestionCard(title: "Fix bug", icon: "ladybug", action: { })
    }
    .padding()
}
