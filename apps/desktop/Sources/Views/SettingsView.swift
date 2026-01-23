//
//  SettingsView.swift
//  pi
//
//  Settings window content
//

import AppKit
import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            Tab("General", systemImage: "gear") {
                GeneralSettingsView()
            }

            Tab("Server", systemImage: "server.rack") {
                ServerSettingsView()
            }

            Tab("Advanced", systemImage: "gearshape.2") {
                AdvancedSettingsView()
            }
        }
        .scenePadding()
        .frame(width: 450)
        .frame(minHeight: 300)
    }
}

// MARK: - General Settings

struct GeneralSettingsView: View {
    @State private var installedVersion: String?
    @State private var latestVersion: String?
    @State private var isCheckingUpdate = false
    @State private var isUpdating = false
    @State private var updateProgress: Double = 0
    @State private var updateStatus: String = ""

    private var updateAvailable: Bool {
        guard let installed = installedVersion,
              let latest = latestVersion else {
            return false
        }
        return installed != latest
    }

    var body: some View {
        Form {
            Section {
                LabeledContent("Installed version") {
                    if let version = installedVersion {
                        Text(version)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Unknown")
                            .foregroundStyle(.tertiary)
                    }
                }

                LabeledContent("Latest version") {
                    if isCheckingUpdate {
                        ProgressView()
                            .scaleEffect(0.5)
                            .frame(height: 16)
                    } else if let version = latestVersion {
                        Text(version)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Unknown")
                            .foregroundStyle(.tertiary)
                    }
                }

                if updateAvailable {
                    if isUpdating {
                        VStack(alignment: .leading, spacing: 4) {
                            ProgressView(value: updateProgress)
                            Text(updateStatus)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Button("Update Binary") {
                            performUpdate()
                        }
                    }
                }
            } header: {
                Text("Pi Binary")
            }
        }
        .formStyle(.grouped)
        .task {
            await loadVersions()
        }
    }

    private func loadVersions() async {
        installedVersion = await BinaryUpdateService.shared.currentVersion

        isCheckingUpdate = true
        let result = await BinaryUpdateService.shared.checkForUpdates()
        isCheckingUpdate = false

        switch result {
        case .upToDate:
            latestVersion = installedVersion
        case .updateAvailable(let version):
            latestVersion = version
        case .checkFailed:
            latestVersion = nil
        }
    }

    private func performUpdate() {
        isUpdating = true
        updateProgress = 0
        updateStatus = "Starting..."

        Task {
            do {
                try await BinaryUpdateService.shared.applyUpdate { @Sendable progress, status in
                    Task { @MainActor in
                        self.updateProgress = progress
                        self.updateStatus = status
                    }
                }
                await MainActor.run {
                    installedVersion = latestVersion
                    isUpdating = false
                }
            } catch {
                await MainActor.run {
                    updateStatus = "Update failed: \(error.localizedDescription)"
                    isUpdating = false
                }
            }
        }
    }
}

// MARK: - Server Settings

struct ServerSettingsView: View {
    @State private var serverConfig = ServerConfig.shared
    @State private var serverURLText = ""
    @State private var isValidating = false
    @State private var validationError: String?

    var body: some View {
        Form {
            Section {
                TextField("Server URL", text: $serverURLText)
                    .textFieldStyle(.roundedBorder)
                    .onAppear {
                        serverURLText = serverConfig.serverURL?.absoluteString ?? ""
                    }

                if let error = validationError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                HStack {
                    if serverConfig.isConfigured {
                        Button("Disconnect", role: .destructive) {
                            serverConfig.clearServerURL()
                            serverURLText = ""
                        }
                    }

                    Spacer()

                    Button("Connect") {
                        connectToServer()
                    }
                    .disabled(serverURLText.isEmpty || isValidating)
                }
            } header: {
                Text("Remote Server")
            } footer: {
                Text("Connect to a Pi server for remote code sessions. Local sessions do not require a server connection.")
                    .foregroundStyle(.secondary)
            }

            if serverConfig.isConfigured {
                Section {
                    LabeledContent("Status") {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 8, height: 8)
                            Text("Connected")
                                .foregroundStyle(.secondary)
                        }
                    }

                    LabeledContent("URL") {
                        Text(serverConfig.serverURL?.absoluteString ?? "-")
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Connection")
                }
            }
        }
        .formStyle(.grouped)
    }

    private func connectToServer() {
        guard let url = URL(string: serverURLText) else {
            validationError = "Invalid URL"
            return
        }

        // Basic URL validation
        guard url.scheme == "ws" || url.scheme == "wss" || url.scheme == "http" || url.scheme == "https" else {
            validationError = "URL must start with ws://, wss://, http://, or https://"
            return
        }

        validationError = nil
        serverConfig.setServerURL(url)
    }
}

// MARK: - Advanced Settings

struct AdvancedSettingsView: View {
    @Environment(\.appState) private var appState
    @AppStorage("showDebugPanel") private var showDebugPanel = false
    @State private var showResetConfirmation = false
    @State private var resetError: String?

    var body: some View {
        Form {
            Section {
                Toggle("Show debug panel", isOn: $showDebugPanel)
            } header: {
                Text("Developer")
            } footer: {
                Text("Shows RPC events and debug information in a side panel.")
                    .foregroundStyle(.secondary)
            }

            Section {
                Button("Reset All Data", role: .destructive) {
                    showResetConfirmation = true
                }

                if let error = resetError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            } header: {
                Text("Data")
            } footer: {
                Text("Deletes all app data including the pi binary, sessions, and settings. You will need to set up the app again.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .confirmationDialog(
            "Reset All Data?",
            isPresented: $showResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset", role: .destructive) {
                performReset()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will delete all app data including:\n• Pi binary\n• All sessions\n• Auth configuration\n• Worktrees\n\nThis action cannot be undone.")
        }
    }

    private func performReset() {
        do {
            try appState.resetAllData()
            resetError = nil
            // Close settings window - the app will show SetupView
            NSApp.keyWindow?.close()
        } catch {
            resetError = "Reset failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
}
