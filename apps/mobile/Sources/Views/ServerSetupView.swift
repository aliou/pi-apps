//
//  ServerSetupView.swift
//  Pi
//
//  View for entering and connecting to a Pi server URL
//

import SwiftUI
import PiCore
import PiUI

struct ServerSetupView: View {
    @State private var serverConfig = ServerConfig.shared
    @State private var urlText = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @State private var showSuccess = false

    let onConnected: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Logo and title
            VStack(spacing: 16) {
                Image("PiLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                    .foregroundStyle(Theme.accent)

                Text("Connect to Server")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundStyle(Theme.text)

                Text("Enter the URL of your Pi relay server.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            // URL input section
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Server URL")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.textSecondary)

                    TextField("http://localhost:31415", text: $urlText)
                        .textFieldStyle(.plain)
                        .padding(12)
                        .background(Theme.inputBg)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(errorMessage != nil ? Theme.error : Theme.borderMuted, lineWidth: 1)
                        )
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .disabled(isConnecting)
                }

                // Error message
                if let error = errorMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(Theme.error)

                        Text(error)
                            .font(.caption)
                            .foregroundStyle(Theme.error)

                        Spacer()
                    }
                }

                // Success indicator
                if showSuccess {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.success)

                        Text("Connected successfully!")
                            .font(.caption)
                            .foregroundStyle(Theme.success)

                        Spacer()
                    }
                }
            }
            .padding(.horizontal, 24)

            // Connect button
            Button(action: { Task { await connect() } }) {
                HStack(spacing: 8) {
                    if isConnecting {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.8)
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.right.circle.fill")
                    }
                    Text(isConnecting ? "Connecting..." : "Connect")
                        .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(isConnecting ? Theme.muted : Theme.accent)
                .foregroundStyle(.white)
                .cornerRadius(10)
            }
            .disabled(isConnecting || urlText.trimmingCharacters(in: .whitespaces).isEmpty)
            .padding(.horizontal, 24)

            Spacer()

            // Help text
            Text("Make sure the Pi server is running and accessible")
                .font(.caption2)
                .foregroundStyle(Theme.dim)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    // MARK: - Connection Logic

    private func connect() async {
        // Reset state
        errorMessage = nil
        showSuccess = false
        isConnecting = true

        defer { isConnecting = false }

        // Validate URL format
        let trimmedURL = urlText.trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: trimmedURL) else {
            errorMessage = "Invalid URL format"
            return
        }

        // Ensure it's an HTTP URL
        guard url.scheme == "http" || url.scheme == "https" else {
            errorMessage = "URL must start with http:// or https://"
            return
        }

        // Test connection via REST health endpoint
        do {
            let client = RelayAPIClient(baseURL: url)
            let health = try await client.health()

            guard health.ok else {
                errorMessage = "Server returned unhealthy status"
                return
            }

            // Success - save URL and notify
            showSuccess = true
            serverConfig.setServerURL(url)

            // Small delay to show success state
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s

            onConnected()
        } catch let error as RelayAPIError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Connection failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Previews

#Preview("Initial State") {
    ServerSetupView {
        print("Connected!")
    }
}

#Preview("Dark Mode") {
    ServerSetupView {
        print("Connected!")
    }
    .preferredColorScheme(.dark)
}

// Static preview for error states
private struct ServerSetupPreview: View {
    let urlText: String
    let isConnecting: Bool
    let errorMessage: String?
    let showSuccess: Bool

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "sparkles")
                    .font(.system(size: 64))
                    .foregroundStyle(Theme.accent)

                Text("Connect to Server")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundStyle(Theme.text)

                Text("Enter the URL of your Pi relay server.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Server URL")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(Theme.textSecondary)

                    Text(urlText.isEmpty ? "http://localhost:31415" : urlText)
                        .foregroundStyle(urlText.isEmpty ? Theme.muted : Theme.text)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.inputBg)
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(errorMessage != nil ? Theme.error : Theme.borderMuted, lineWidth: 1)
                        )
                }

                if let error = errorMessage {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundStyle(Theme.error)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(Theme.error)
                        Spacer()
                    }
                }

                if showSuccess {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.success)
                        Text("Connected successfully!")
                            .font(.caption)
                            .foregroundStyle(Theme.success)
                        Spacer()
                    }
                }
            }
            .padding(.horizontal, 24)

            HStack(spacing: 8) {
                if isConnecting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                }
                Text(isConnecting ? "Connecting..." : "Connect")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(isConnecting ? Theme.muted : Theme.accent)
            .foregroundStyle(.white)
            .cornerRadius(10)
            .padding(.horizontal, 24)

            Spacer()

            Text("Make sure the Pi server is running and accessible")
                .font(.caption2)
                .foregroundStyle(Theme.dim)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }
}

#Preview("With URL") {
    ServerSetupPreview(
        urlText: "https://pi.example.com",
        isConnecting: false,
        errorMessage: nil,
        showSuccess: false
    )
}

#Preview("Connecting") {
    ServerSetupPreview(
        urlText: "https://pi.example.com",
        isConnecting: true,
        errorMessage: nil,
        showSuccess: false
    )
}

#Preview("Error State") {
    ServerSetupPreview(
        urlText: "https://invalid-server.com",
        isConnecting: false,
        errorMessage: "Connection refused - server may be offline",
        showSuccess: false
    )
}

#Preview("Success") {
    ServerSetupPreview(
        urlText: "https://pi.example.com",
        isConnecting: false,
        errorMessage: nil,
        showSuccess: true
    )
}
