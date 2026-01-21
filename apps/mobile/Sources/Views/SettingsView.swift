//
//  SettingsView.swift
//  Pi
//
//  App settings organized into iOS-native sections
//

import SwiftUI
import PiUI

struct SettingsView: View {
    let serverURL: URL?
    let onDisconnect: () -> Void

    @State private var settings = AppSettings.shared
    @State private var showSystemPromptEditor = false

    var body: some View {
        Form {
            connectionSection
            chatSettingsSection
            messageBehaviorSection
            aboutSection
            actionsSection
        }
    }

    // MARK: - Connection Section

    private var connectionSection: some View {
        Section {
            LabeledContent("Server") {
                Text(serverURL?.host ?? "Not connected")
                    .foregroundStyle(.secondary)
            }

            LabeledContent("Status") {
                HStack(spacing: 6) {
                    Circle()
                        .fill(serverURL != nil ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    Text(serverURL != nil ? "Connected" : "Disconnected")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Connection")
        }
    }

    // MARK: - Chat Settings Section

    private var chatSettingsSection: some View {
        Section {
            NavigationLink {
                SystemPromptEditorView(text: $settings.chatSystemPrompt) {
                    settings.resetToDefault()
                }
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("System Prompt")
                    Text(settings.chatSystemPrompt.prefix(100) + (settings.chatSystemPrompt.count > 100 ? "…" : ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        } header: {
            Text("Chat")
        } footer: {
            Text("Instructions that define how the assistant behaves in chat sessions.")
        }
    }

    // MARK: - Message Behavior Section

    private var messageBehaviorSection: some View {
        Section {
            Picker("During Streaming", selection: $settings.streamingBehavior) {
                Text("Steer").tag(PiUI.StreamingBehavior.steer)
                Text("Follow-up").tag(PiUI.StreamingBehavior.followUp)
            }
        } header: {
            Text("Message Delivery")
        } footer: {
            Text(streamingBehaviorFooter)
        }
    }

    private var streamingBehaviorFooter: String {
        switch settings.streamingBehavior {
        case .steer:
            return "Steer: Interrupts the current response. Your message is processed immediately."
        case .followUp:
            return "Follow-up: Waits for the current response to finish before processing your message."
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        Section {
            NavigationLink {
                DeviceContextView()
            } label: {
                Text("Device Context")
            }

            LabeledContent("Version") {
                Text(appVersion)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("About")
        }
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        Section {
            Button(role: .destructive) {
                onDisconnect()
            } label: {
                HStack {
                    Spacer()
                    Text("Disconnect from Server")
                    Spacer()
                }
            }
        }
    }
}

// MARK: - System Prompt Editor

private struct SystemPromptEditorView: View {
    @Binding var text: String
    let onReset: () -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var isFocused: Bool

    var body: some View {
        TextEditor(text: $text)
            .font(.body.monospaced())
            .focused($isFocused)
            .navigationTitle("System Prompt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Reset to Default", role: .destructive) {
                            onReset()
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .onAppear {
                isFocused = true
            }
    }
}

// MARK: - Device Context View

private struct DeviceContextView: View {
    var body: some View {
        ScrollView {
            Text(AppSettings.buildDeviceContext())
                .font(.body.monospaced())
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Device Context")
        .navigationBarTitleDisplayMode(.inline)
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Previews

#Preview("Settings") {
    NavigationStack {
        SettingsView(serverURL: URL(string: "wss://pi.example.com")) {}
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Settings - Disconnected") {
    NavigationStack {
        SettingsView(serverURL: nil) {}
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("System Prompt Editor") {
    NavigationStack {
        SystemPromptEditorView(text: .constant(AppSettings.defaultChatSystemPrompt)) {}
    }
}
