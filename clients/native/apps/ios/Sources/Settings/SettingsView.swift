import SwiftUI

struct SettingsView: View {
    var body: some View {
        Form {
            Section("Server") {
                Text("Not configured")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}
