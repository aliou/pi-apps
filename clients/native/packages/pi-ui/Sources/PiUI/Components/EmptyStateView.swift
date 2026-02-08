import SwiftUI

/// Centered empty state with icon, title, optional subtitle, and optional action button.
public struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String?
    let actionTitle: String?
    let action: (() -> Void)?

    public init(
        icon: String,
        title: String,
        subtitle: String? = nil,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            if let subtitle {
                Text(subtitle)
            }
        } actions: {
            if let actionTitle, let action {
                Button(actionTitle, action: action)
            }
        }
    }
}

#Preview("With subtitle and action") {
    EmptyStateView(
        icon: "checkmark.circle",
        title: "All Done",
        subtitle: "Your task is complete",
        actionTitle: "Start Over",
        action: { }
    )
}

#Preview("Minimal") {
    EmptyStateView(
        icon: "questionmark.circle",
        title: "No Sessions",
        subtitle: nil,
        actionTitle: nil,
        action: nil
    )
}
