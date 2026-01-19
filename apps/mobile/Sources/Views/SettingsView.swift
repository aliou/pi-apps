import SwiftUI
import PiCore
import PiUI

struct SettingsView: View {
    let serverURL: URL?
    let onDisconnect: () -> Void

    var body: some View {
        List {
            Section {
                HStack {
                    Text("Server URL")
                        .foregroundColor(Theme.text)
                    Spacer()
                    Text(serverURL?.absoluteString ?? "Not connected")
                        .foregroundColor(Theme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            } header: {
                Text("Connection")
            }

            Section {
                Button {
                    onDisconnect()
                } label: {
                    HStack {
                        Spacer()
                        Text("Disconnect")
                            .fontWeight(.semibold)
                        Spacer()
                    }
                }
                .foregroundColor(Theme.error)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.pageBg)
    }
}

// MARK: - Previews

#Preview("Light Mode") {
    SettingsView(serverURL: URL(string: "wss://pi.example.com")) {
    }
}

#Preview("Dark Mode") {
    SettingsView(serverURL: URL(string: "wss://pi.example.com")) {
    }
    .preferredColorScheme(.dark)
}

#Preview("No Server") {
    SettingsView(serverURL: nil) {
    }
}
