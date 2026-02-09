import SwiftUI

/// Reusable glass card container for onboarding screens.
struct OnboardingCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 24) {
            content
        }
        .padding(28)
        .frame(maxWidth: 380)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
    }
}
