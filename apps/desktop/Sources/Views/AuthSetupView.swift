//
//  AuthSetupView.swift
//  pi
//
//  Shown when no API keys are configured
//

import SwiftUI
import PiCore

struct AuthSetupView: View {
    let onComplete: () -> Void

    @State private var isSettingUp = false
    @State private var setupError: String?
    @State private var cliConfigExists = false

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "key")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)

                Text("API Keys Required")
                    .font(.title)
                    .fontWeight(.semibold)

                Text(cliConfigExists
                    ? "Link your Pi CLI credentials to get started"
                    : "Set up the Pi CLI first, then link your credentials")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
            }

            if cliConfigExists {
                Button {
                    setupCLICredentials()
                } label: {
                    HStack(spacing: 8) {
                        if isSettingUp {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                        Text(isSettingUp ? "Linking..." : "Use CLI Credentials")
                    }
                    .frame(minWidth: 160)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isSettingUp)
            } else {
                VStack(spacing: 16) {
                    Text("Run these commands in Terminal:")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 8) {
                        codeBlock("npm install -g @anthropic-ai/claude-cli")
                        codeBlock("claude login")
                    }

                    Button("I've Set It Up") {
                        checkCLIConfig()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
            }

            if let error = setupError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            Spacer()

            if cliConfigExists {
                Text("Your CLI credentials will be symlinked to the app")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.bottom, 24)
            }
        }
        .frame(width: 400, height: 400)
        .onAppear {
            checkCLIConfig()
        }
    }

    @ViewBuilder
    private func codeBlock(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, design: .monospaced))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(6)
    }

    private func checkCLIConfig() {
        let cliAgentPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".pi/agent")

        let authJsonPath = cliAgentPath.appendingPathComponent("auth.json")
        let modelsJsonPath = cliAgentPath.appendingPathComponent("models.json")

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
                    onComplete()
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

#Preview("No CLI Config") {
    AuthSetupView {
        print("Complete")
    }
}

#Preview("CLI Config Exists") {
    AuthSetupView {
        print("Complete")
    }
}
