import SwiftUI

/// Floating glass card that displays an error message below the main card.
struct ErrorCard: View {
    let message: String

    var body: some View {
        OnboardingCard {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.body)

                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        ErrorCard(message: "Could not reach server: connection refused")
    }
}
