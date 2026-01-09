//
//  SettingsView.swift
//  pi
//
//  Settings window content
//

import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            Tab("General", systemImage: "gear") {
                GeneralSettingsView()
            }

            Tab("Advanced", systemImage: "gearshape.2") {
                AdvancedSettingsView()
            }
        }
        .scenePadding()
        .frame(width: 450)
        .frame(minHeight: 250)
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
                try await BinaryUpdateService.shared.applyUpdate { progress, status in
                    Task { @MainActor in
                        updateProgress = progress
                        updateStatus = status
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

// MARK: - Advanced Settings

struct AdvancedSettingsView: View {
    @AppStorage("showDebugPanel") private var showDebugPanel = false

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
        }
        .formStyle(.grouped)
    }
}

// MARK: - Preview

#Preview {
    SettingsView()
}
