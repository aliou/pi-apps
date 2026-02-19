import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var urlText: String = ""

    var body: some View {
        Form {
            Section("Server") {
                TextField("Relay URL", text: $urlText)
                    .accessibilityIdentifier("relay-url-field")
                    .textContentType(.URL)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    #endif
                    .submitLabel(.done)
                    .onSubmit { saveURL() }
                    .onAppear { urlText = appState.relayURL.absoluteString }

                Button("Save") { saveURL() }
                    .accessibilityIdentifier("save-button")
                    .disabled(URL(string: urlText) == nil)
            }
        }
        .navigationTitle("Settings")
    }

    private func saveURL() {
        guard let url = URL(string: urlText) else { return }
        appState.relayURL = url
    }
}
