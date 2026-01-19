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
                SessionTabsView()
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
        } catch {
            connectionError = error.localizedDescription
            print("[MainView] Connection failed: \(error)")
        }

        isConnecting = false
    }
}

// MARK: - Preview

#Preview("Server Setup") {
    MainView()
}
