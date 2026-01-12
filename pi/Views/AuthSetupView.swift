//
//  AuthSetupView.swift
//  pi
//
//  Shown when no API keys are configured
//

import SwiftUI
import PiCore

struct AuthSetupView: View {
    let onRetry: () -> Void

    @State private var selectedOption: AuthOption = .useCLI
    @State private var isSettingUp = false
    @State private var setupError: String?
    @State private var cliConfigExists = false

    enum AuthOption {
        case useCLI
        case custom
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Icon and title
                VStack(spacing: 12) {
                    Image(systemName: "key.fill")
                        .font(.system(size: 48))
                        .foregroundColor(Theme.warning)

                    Text("API Keys Required")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(Theme.text)

                    Text("Pi needs API keys to connect to AI providers like Anthropic, OpenAI, or Google.")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 400)
                }
                .padding(.top, 24)

                // Options
                VStack(spacing: 16) {
                    // Option 1: Use CLI credentials
                    optionCard(
                        option: .useCLI,
                        title: "Use Pi CLI Credentials",
                        description: cliConfigExists
                            ? "Share API keys with the pi command-line tool. Your existing configuration will be used."
                            : "Share API keys with the pi command-line tool. No CLI configuration found yet.",
                        icon: "terminal.fill",
                        enabled: cliConfigExists
                    )

                    // Option 2: Custom API keys (coming soon)
                    optionCard(
                        option: .custom,
                        title: "Enter Custom API Keys",
                        description: "Store API keys securely in the macOS Keychain. Coming soon.",
                        icon: "key.horizontal.fill",
                        enabled: false,
                        comingSoon: true
                    )
                }
                .frame(maxWidth: 450)

                // Setup button
                if cliConfigExists && selectedOption == .useCLI {
                    Button {
                        setupCLICredentials()
                    } label: {
                        HStack {
                            if isSettingUp {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .frame(width: 16, height: 16)
                            }
                            Text(isSettingUp ? "Setting up..." : "Use CLI Credentials")
                        }
                        .frame(minWidth: 200)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Theme.accent)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSettingUp)
                }

                // Error message
                if let error = setupError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.error)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Theme.toolErrorBg)
                        .cornerRadius(8)
                }

                // Help text
                if !cliConfigExists {
                    VStack(spacing: 8) {
                        Text("To set up pi CLI credentials:")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.text)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("1. Install pi CLI: npm install -g @anthropic/pi")
                            Text("2. Run: pi")
                            Text("3. Follow the prompts to add your API key")
                            Text("4. Return here and click retry")
                        }
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.muted)

                        Button("Retry") {
                            checkCLIConfig()
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(Theme.accent)
                        .padding(.top, 8)
                    }
                    .padding(16)
                    .background(Theme.cardBg)
                    .cornerRadius(8)
                    .frame(maxWidth: 450)
                }

                Spacer()
            }
            .padding(24)
        }
        .frame(width: 500, height: 550)
        .background(Theme.pageBg)
        .onAppear {
            checkCLIConfig()
        }
    }

    @ViewBuilder
    private func optionCard(
        option: AuthOption,
        title: String,
        description: String,
        icon: String,
        enabled: Bool,
        comingSoon: Bool = false
    ) -> some View {
        Button {
            if enabled {
                selectedOption = option
            }
        } label: {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(enabled ? Theme.accent : Theme.dim)
                    .frame(width: 40)

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(title)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(enabled ? Theme.text : Theme.dim)

                        if comingSoon {
                            Text("Coming Soon")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(Theme.warning)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Theme.warning.opacity(0.2))
                                .cornerRadius(4)
                        }
                    }

                    Text(description)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.muted)
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                if enabled {
                    Image(systemName: selectedOption == option ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundColor(selectedOption == option ? Theme.accent : Theme.dim)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(selectedOption == option && enabled ? Theme.selectedBg : Theme.cardBg)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(selectedOption == option && enabled ? Theme.accent : Theme.borderMuted, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.6)
    }

    private func checkCLIConfig() {
        // Check if ~/.pi/agent exists and has auth files
        let cliAgentPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".pi/agent")

        let authJsonPath = cliAgentPath.appendingPathComponent("auth.json")
        let modelsJsonPath = cliAgentPath.appendingPathComponent("models.json")

        // Check if either auth.json or models.json exists
        cliConfigExists = FileManager.default.fileExists(atPath: authJsonPath.path) ||
            FileManager.default.fileExists(atPath: modelsJsonPath.path)
    }

    private func setupCLICredentials() {
        isSettingUp = true
        setupError = nil

        Task {
            do {
                try await linkCLICredentials()
                await MainActor.run {
                    isSettingUp = false
                    onRetry()
                }
            } catch {
                await MainActor.run {
                    setupError = error.localizedDescription
                    isSettingUp = false
                }
            }
        }
    }

    private func linkCLICredentials() async throws {
        let fm = FileManager.default
        let cliAuthJson = fm.homeDirectoryForCurrentUser.appendingPathComponent(".pi/agent/auth.json")
        let appAgentDir = URL(fileURLWithPath: AppPaths.agentPath)
        let appAuthJson = appAgentDir.appendingPathComponent("auth.json")

        // Ensure app agent directory exists
        if !fm.fileExists(atPath: appAgentDir.path) {
            try fm.createDirectory(at: appAgentDir, withIntermediateDirectories: true)
        }

        // Remove existing auth.json if it exists
        if fm.fileExists(atPath: appAuthJson.path) {
            try fm.removeItem(at: appAuthJson)
        }

        // Create symlink for auth.json only
        try fm.createSymbolicLink(at: appAuthJson, withDestinationURL: cliAuthJson)
    }
}

#Preview {
    AuthSetupView {
        print("Retry tapped")
    }
    .frame(width: 600, height: 500)
}
