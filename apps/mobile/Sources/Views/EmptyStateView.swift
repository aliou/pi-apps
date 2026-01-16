import SwiftUI
import PiCore

/// Empty state view shown when no session is active.
/// Displays a centered logo and greeting message.
struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Pi logo with SF Symbol fallback
            logoView
                .foregroundColor(Theme.accent)

            // Greeting text
            Text("How can I help you today?")
                .font(.title)
                .fontWeight(.semibold)
                .foregroundColor(Theme.text)
                .multilineTextAlignment(.center)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    @ViewBuilder
    private var logoView: some View {
        if UIImage(named: "PiLogo") != nil {
            Image("PiLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
        } else {
            Image(systemName: "sparkles")
                .font(.system(size: 64))
        }
    }
}

// MARK: - Previews

#Preview("Light Mode") {
    EmptyStateView()
}

#Preview("Dark Mode") {
    EmptyStateView()
        .preferredColorScheme(.dark)
}

#Preview("With Input Bar") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack(spacing: 0) {
            EmptyStateView()

            ChatInputBar(
                text: .constant(""),
                repoName: "aliou/pi-apps",
                isProcessing: false,
                canSelectModel: true,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
}

#Preview("Dark with Input") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack(spacing: 0) {
            EmptyStateView()

            ChatInputBar(
                text: .constant(""),
                repoName: nil,
                isProcessing: false,
                canSelectModel: true,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
    .preferredColorScheme(.dark)
}
