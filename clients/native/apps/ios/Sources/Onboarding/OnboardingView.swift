import SwiftUI

/// Full-screen onboarding view with a two-step card flow:
/// 1. Welcome card fades in over the staggered pi digits background.
/// 2. On tap, welcome card exits left while server setup card enters from the right.
struct OnboardingView: View {
    /// Called when the user successfully connects. Passes the validated URL.
    var onComplete: (URL) -> Void

    @State private var step: Step = .welcome
    @State private var showCard = false

    @State private var serverURL = "http://localhost:31415"
    @State private var isConnecting = false
    @State private var errorMessage: String?

    private enum Step {
        case welcome
        case serverSetup
    }

    var body: some View {
        ZStack {
            PiDigitsBackground(staggeredReveal: true)
                .ignoresSafeArea()

            cardLayer
        }
        .task {
            try? await Task.sleep(for: .milliseconds(800))
            withAnimation(.easeOut(duration: 0.5)) {
                showCard = true
            }
        }
    }

    // MARK: - Card layer

    @ViewBuilder
    private var cardLayer: some View {
        Group {
            if step == .welcome {
                WelcomeCard {
                    withAnimation(.easeInOut(duration: 0.45)) {
                        step = .serverSetup
                    }
                }
                .transition(.asymmetric(
                    insertion: .opacity,
                    removal: .move(edge: .leading).combined(with: .opacity)
                ))
            }

            if step == .serverSetup {
                VStack(spacing: 16) {
                    ServerSetupCard(
                        serverURL: $serverURL,
                        isConnecting: isConnecting,
                        onConnect: connect
                    )

                    if let errorMessage {
                        ErrorCard(message: errorMessage)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .transition(.asymmetric(
                    insertion: .move(edge: .trailing).combined(with: .opacity),
                    removal: .opacity
                ))
            }
        }
        .padding(.horizontal, 24)
        .opacity(showCard ? 1 : 0)
        .scaleEffect(showCard ? 1 : 0.92)
    }

    // MARK: - Connection

    private func connect() {
        guard let url = URL(string: serverURL),
              url.scheme != nil,
              url.host != nil else {
            withAnimation(.easeInOut(duration: 0.3)) {
                errorMessage = "Enter a valid URL (e.g. http://192.168.1.100:31415)"
            }
            return
        }

        withAnimation(.easeInOut(duration: 0.3)) {
            errorMessage = nil
        }
        isConnecting = true

        Task {
            do {
                let healthURL = url.appendingPathComponent("health")
                let (_, response) = try await URLSession.shared.data(from: healthURL)

                guard let http = response as? HTTPURLResponse,
                      http.statusCode == 200 else {
                    isConnecting = false
                    withAnimation(.easeInOut(duration: 0.3)) {
                        errorMessage = "Server returned an error. Check the URL and try again."
                    }
                    return
                }

                isConnecting = false
                onComplete(url)
            } catch {
                isConnecting = false
                withAnimation(.easeInOut(duration: 0.3)) {
                    errorMessage = "Could not reach server: \(error.localizedDescription)"
                }
            }
        }
    }
}

#Preview {
    OnboardingView { url in
        print("Connected to \(url)")
    }
}
