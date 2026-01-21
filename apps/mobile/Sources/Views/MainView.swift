//
//  MainView.swift
//  Pi
//
//  Main app view - handles server connection and shows appropriate content
//

import SwiftUI
import PiCore
import PiUI

struct MainView: View {
    @State private var serverConfig = ServerConfig.shared
    @State private var connection: ServerConnection?
    @State private var isConnecting = false
    @State private var connectionError: String?

    var body: some View {
        Group {
            if !serverConfig.isConfigured {
                ServerSetupView {
                    Task { await connect() }
                }
            } else if isConnecting {
                connectingView
            } else if let connection, connection.isConnected {
                ConversationView()
                    .environment(connection)
            } else {
                connectionFailedView
            }
        }
        .task {
            if serverConfig.isConfigured && connection == nil {
                await connect()
            }
        }
    }

    // MARK: - Connecting View

    private var connectingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Connecting to server...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Connection Failed View

    private var connectionFailedView: some View {
        ContentUnavailableView {
            Label("Connection Failed", systemImage: "wifi.slash")
        } description: {
            if let error = connectionError {
                Text(error)
            } else {
                Text("Could not connect to the server.")
            }
        } actions: {
            HStack(spacing: 16) {
                Button("Retry") {
                    Task { await connect() }
                }
                .buttonStyle(.bordered)

                Button("Change Server") {
                    serverConfig.clearServerURL()
                    connection = nil
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    // MARK: - Actions

    private func connect() async {
        guard let url = serverConfig.serverURL else { return }

        isConnecting = true
        connectionError = nil

        let newConnection = ServerConnection(serverURL: url)

        do {
            try await newConnection.connect()
            connection = newConnection

            // Sync default model settings after successful connection
            await syncDefaultModel(with: newConnection)
        } catch {
            connectionError = error.localizedDescription
            print("[MainView] Connection failed: \(error)")
        }

        isConnecting = false
    }

    private func syncDefaultModel(with connection: ServerConnection) async {
        do {
            // Fetch server's default model
            if let serverDefault = try await connection.getDefaultModel() {
                // Server has a default - use it
                serverConfig.setSelectedModel(provider: serverDefault.provider, modelId: serverDefault.id)
                print("[MainView] Synced default model from server: \(serverDefault.provider)/\(serverDefault.id)")
            } else if let localProvider = serverConfig.selectedModelProvider,
                      let localModelId = serverConfig.selectedModelId {
                // Server has no default but we have a local preference - push to server
                _ = try await connection.setDefaultModel(provider: localProvider, modelId: localModelId)
                print("[MainView] Pushed local default model to server: \(localProvider)/\(localModelId)")
            }
        } catch {
            // Non-fatal - settings sync failure shouldn't block app usage
            print("[MainView] Failed to sync default model: \(error)")
        }
    }
}

// MARK: - Preview

#Preview("Server Setup") {
    MainView()
}
