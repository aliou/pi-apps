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
    @ObservedObject private var serverConfig = ServerConfig.shared
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

                Text("Pi is your personal AI assistant server. Enter the WebSocket URL where your Pi server is running.")
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

                    TextField("ws://localhost:3141", text: $urlText)
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

        // Ensure it's a WebSocket URL
        guard url.scheme == "ws" || url.scheme == "wss" else {
            errorMessage = "URL must start with ws:// or wss://"
            return
        }

        // Test connection
        do {
            try await testConnection(url: url)

            // Success - save URL and notify
            showSuccess = true
            serverConfig.setServerURL(url)

            // Small delay to show success state
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s

            onConnected()
        } catch let error as RPCTransportError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = "Connection failed: \(error.localizedDescription)"
        }
    }

    private func testConnection(url: URL) async throws {
        // Build WebSocket URL
        var wsURL = url
        if !wsURL.path.hasSuffix("/rpc") {
            wsURL = url.appendingPathComponent("rpc")
        }

        // Simple WebSocket test without full transport
        let session = URLSession(configuration: .default)
        let task = session.webSocketTask(with: wsURL)
        task.resume()

        // Send hello
        let hello: [String: Any] = [
            "v": 1,
            "kind": "request",
            "id": "test-hello",
            "method": "hello",
            "params": [
                "client": [
                    "name": "pi-mobile",
                    "version": "1.0"
                ]
            ]
        ]

        let helloData = try JSONSerialization.data(withJSONObject: hello)
        try await task.send(.data(helloData))

        // Receive response with timeout
        let response = try await withThrowingTaskGroup(of: URLSessionWebSocketTask.Message.self) { group in
            group.addTask {
                try await task.receive()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 10_000_000_000)
                throw RPCTransportError.timeout
            }
            let result = try await group.next()!
            group.cancelAll()
            return result
        }

        // Parse response
        let responseData: Data
        switch response {
        case .data(let data):
            responseData = data
        case .string(let str):
            responseData = str.data(using: .utf8) ?? Data()
        @unknown default:
            throw RPCTransportError.invalidResponse("Unknown message type")
        }

        // Verify it's a valid hello response
        guard let json = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
              let ok = json["ok"] as? Bool, ok,
              let result = json["result"] as? [String: Any],
              result["connectionId"] != nil else {
            throw RPCTransportError.invalidResponse("Invalid hello response")
        }

        // Clean up
        task.cancel(with: .normalClosure, reason: nil)
        session.invalidateAndCancel()
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

                Text("Pi is your personal AI assistant server. Enter the WebSocket URL where your Pi server is running.")
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

                    Text(urlText.isEmpty ? "ws://localhost:3141" : urlText)
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
        urlText: "wss://pi.example.com",
        isConnecting: false,
        errorMessage: nil,
        showSuccess: false
    )
}

#Preview("Connecting") {
    ServerSetupPreview(
        urlText: "wss://pi.example.com",
        isConnecting: true,
        errorMessage: nil,
        showSuccess: false
    )
}

#Preview("Error State") {
    ServerSetupPreview(
        urlText: "wss://invalid-server.com",
        isConnecting: false,
        errorMessage: "Connection refused - server may be offline",
        showSuccess: false
    )
}

#Preview("Success") {
    ServerSetupPreview(
        urlText: "wss://pi.example.com",
        isConnecting: false,
        errorMessage: nil,
        showSuccess: true
    )
}
