//
//  SettingsView.swift
//  Pi
//
//  App settings organized into iOS-native sections
//

import SwiftUI
import PiCore
import PiUI

struct SettingsView: View {
    let connection: ServerConnection
    let onDisconnect: () -> Void

    @State private var settings = AppSettings.shared
    @State private var serverConfig = ServerConfig.shared
    @State private var showSystemPromptEditor = false
    @State private var showModelSelector = false
    @State private var defaultModel: Model?
    @State private var availableModels: [Model] = []
    @State private var isLoadingModels = false
    @State private var isSyncingModel = false

    var body: some View {
        Form {
            connectionSection
            modelSection
            chatSettingsSection
            messageBehaviorSection
            aboutSection
            actionsSection
        }
        .task {
            await loadModelsAndResolveDefault()
        }
        .sheet(isPresented: $showModelSelector) {
            ModelSelectorSheet(
                models: availableModels,
                currentModel: defaultModel,
                recentModelIds: RecentSelections.loadRecentModelIds()
            ) { model in
                setDefaultModel(model)
            }
        }
    }

    // MARK: - Connection Section

    private var connectionSection: some View {
        Section {
            LabeledContent("Server") {
                Text(connection.serverURL.host ?? "Unknown")
                    .foregroundStyle(.secondary)
            }

            LabeledContent("Status") {
                HStack(spacing: 6) {
                    Circle()
                        .fill(connection.isServerReachable ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    Text(connection.isServerReachable ? "Connected" : "Disconnected")
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Connection")
        }
    }

    // MARK: - Model Section

    private var modelSection: some View {
        Section {
            Button {
                showModelSelector = true
            } label: {
                HStack {
                    Text("Default Model")
                        .foregroundStyle(Theme.text)

                    Spacer()

                    if isLoadingModels {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else if let model = defaultModel {
                        Text(model.name)
                            .foregroundStyle(.secondary)
                    } else if let storedId = serverConfig.selectedModelId {
                        Text(storedId)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Not Set")
                            .foregroundStyle(.secondary)
                    }

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .disabled(isLoadingModels)
        } header: {
            Text("Model")
        } footer: {
            Text("The default model used for new sessions.")
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
                    Text(settings.chatSystemPrompt.prefix(100) + (settings.chatSystemPrompt.count > 100 ? "..." : ""))
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
                Text("Steer").tag(StreamingBehavior.steer)
                Text("Follow-up").tag(StreamingBehavior.followUp)
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

    // MARK: - Data Loading

    private func loadModelsAndResolveDefault() async {
        isLoadingModels = true
        defer { isLoadingModels = false }

        do {
            // Works with or without a session:
            // - With session: uses RPC (full list including extensions)
            // - Without session: uses REST API (built-in providers only)
            let response = try await connection.getAvailableModels()
            availableModels = response.models

            // Resolve locally stored model
            if let storedId = serverConfig.selectedModelId,
               let storedProvider = serverConfig.selectedModelProvider {
                defaultModel = availableModels.first {
                    $0.id == storedId && $0.provider == storedProvider
                }
            }
        } catch {
            print("[SettingsView] Failed to load models: \(error)")
            // Fall back to placeholder if we have stored config
            if let storedId = serverConfig.selectedModelId,
               let storedProvider = serverConfig.selectedModelProvider {
                defaultModel = Model(
                    id: storedId,
                    name: storedId,
                    provider: storedProvider
                )
            }
        }
    }

    private func setDefaultModel(_ model: Model) {
        // Store locally - this becomes the default for new sessions
        defaultModel = model
        serverConfig.setSelectedModel(provider: model.provider, modelId: model.id)
        RecentSelections.addRecentModelId(model.id)
        print("[SettingsView] Default model set to: \(model.provider)/\(model.id)")
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

// MARK: - Previews

#Preview("Settings") {
    NavigationStack {
        SettingsView(
            connection: ServerConnection(serverURL: URL(string: "wss://pi.example.com")!)
        ) {}
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("System Prompt Editor") {
    NavigationStack {
        SystemPromptEditorView(text: .constant(AppSettings.defaultChatSystemPrompt)) {}
    }
}
