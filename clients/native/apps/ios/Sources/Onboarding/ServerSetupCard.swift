import SwiftUI

/// Onboarding card for entering the relay server URL.
struct ServerSetupCard: View {
    @Binding var serverURL: String
    var isConnecting: Bool
    var onConnect: () -> Void

    @FocusState private var isURLFieldFocused: Bool

    var body: some View {
        OnboardingCard {
            header
            urlField
            connectButton
        }
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "network")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)

            Text("Connect to Server")
                .font(.title2.bold())

            Text("Enter your Pi relay server address to get started.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var urlField: some View {
        TextField("http://192.168.1.100:31415", text: $serverURL)
            .textFieldStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(.quaternary, in: .rect(cornerRadius: 10))
            .keyboardType(.URL)
            .textContentType(.URL)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .focused($isURLFieldFocused)
            .onSubmit { onConnect() }
    }

    private var connectButton: some View {
        Button(action: onConnect) {
            if isConnecting {
                ProgressView()
                    .tint(.white)
            } else {
                Text("Connect")
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.regular)
        .disabled(serverURL.isEmpty || isConnecting)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        PiDigitsBackground()
            .ignoresSafeArea()

        ServerSetupCard(
            serverURL: .constant("http://localhost:31415"),
            isConnecting: false,
            onConnect: {}
        )
        .padding()
    }
}
