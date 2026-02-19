import SwiftUI

/// Initial onboarding card showing the app name and a button to proceed.
struct WelcomeCard: View {
    var onContinue: () -> Void

    var body: some View {
        OnboardingCard {
            VStack(spacing: 8) {
                Text("Welcome to")
                    .font(.title3)
                    .foregroundStyle(.secondary)

                Text("Pi")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
            }

            Button("Connect to server", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)
                .accessibilityIdentifier("welcome-continue-button")
        }
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        WelcomeCard { }
    }
}
