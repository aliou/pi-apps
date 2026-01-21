import SwiftUI
import PiUI

struct SettingsView: View {
    let serverURL: URL?
    let onDisconnect: () -> Void

    @State private var settings = AppSettings.shared

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
                TextEditor(text: $settings.chatSystemPrompt)
                    .frame(minHeight: 200)
                    .font(.body.monospaced())
                    .foregroundColor(Theme.text)
                    .scrollContentBackground(.hidden)

                Button("Reset to Default") {
                    settings.resetToDefault()
                }
                .foregroundColor(Theme.accent)
            } header: {
                Text("Chat System Prompt")
            } footer: {
                Text("Instructions for chat sessions.")
                    .foregroundColor(Theme.textSecondary)
            }

            Section {
                Picker("During Streaming", selection: $settings.streamingBehavior) {
                    Text("Steer").tag(PiUI.StreamingBehavior.steer)
                    Text("Follow-up").tag(PiUI.StreamingBehavior.followUp)
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Queued Message Behavior")
            } footer: {
                Text("Used when sending a message while the agent is still streaming.")
                    .foregroundColor(Theme.textSecondary)
            }

            Section {
                Text(AppSettings.buildDeviceContext())
                    .font(.body.monospaced())
                    .foregroundColor(Theme.textSecondary)
            } header: {
                Text("Auto-Appended Context")
            } footer: {
                Text("This device information is automatically added to every chat session.")
                    .foregroundColor(Theme.textSecondary)
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
