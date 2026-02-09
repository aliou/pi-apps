import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var urlText: String = ""

    var body: some View {
        Form {
            Section("Server") {
                TextField("Relay URL", text: $urlText)
                    .textContentType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onSubmit { saveURL() }
                    .onAppear { urlText = appState.relayURL.absoluteString }

                Button("Save") { saveURL() }
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
