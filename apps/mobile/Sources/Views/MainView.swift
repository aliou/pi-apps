//
//  MainView.swift
//  Pi
//
//  Main app view that manages navigation and state
//

import SwiftUI
import PiCore

/// Main app view that handles the navigation flow
struct MainView: View {
    @StateObject private var serverConfig = ServerConfig.shared
    @State private var client: RPCClient?
    @State private var selectedRepo: RepoInfo?
    @State private var selectedSessionId: String?
    @State private var navigationPath = NavigationPath()

    var body: some View {
        Group {
            if !serverConfig.isConfigured {
                // Show server setup
                ServerSetupView {
                    // Server configured - create client
                    createClient()
                }
            } else if client == nil {
                // Connecting to server
                connectingView
            } else if let client {
                // Main navigation
                NavigationStack(path: $navigationPath) {
                    RepoListView(client: client) { repo in
                        selectedRepo = repo
                        navigationPath.append(NavigationDestination.sessions(repo: repo))
                    }
                    .navigationDestination(for: NavigationDestination.self) { destination in
                        switch destination {
                        case .sessions(let repo):
                            SessionListView(
                                client: client,
                                repoId: repo.id,
                                repoName: repo.name
                            ) { sessionId in
                                selectedSessionId = sessionId
                                navigationPath.append(NavigationDestination.conversation(sessionId: sessionId))
                            }
                        case .conversation(let sessionId):
                            ConversationView(client: client, sessionId: sessionId) {
                                // Pop back to sessions when disconnected
                                navigationPath.removeLast()
                            }
                        }
                    }
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Menu {
                                Button(role: .destructive) {
                                    disconnect()
                                } label: {
                                    Label("Disconnect", systemImage: "wifi.slash")
                                }
                            } label: {
                                Image(systemName: "ellipsis.circle")
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            if serverConfig.isConfigured && client == nil {
                createClient()
            }
        }
    }

    // MARK: - Connecting View

    private var connectingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)

            Text("Connecting to server...")
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    // MARK: - Actions

    private func createClient() {
        guard let url = serverConfig.serverURL else { return }

        print("[MainView] Creating RPCClient for \(url)")
        let newClient = RPCClient(serverURL: url)

        Task {
            do {
                print("[MainView] Connecting...")
                try await newClient.connect()
                print("[MainView] Connected successfully!")
                await MainActor.run {
                    self.client = newClient
                }
            } catch {
                print("[MainView] Connection failed: \(error)")
                // Connection failed - clear config to show setup again
                await MainActor.run {
                    serverConfig.clearServerURL()
                }
            }
        }
    }

    private func disconnect() {
        Task {
            await client?.disconnect()
            await MainActor.run {
                client = nil
                selectedRepo = nil
                selectedSessionId = nil
                navigationPath = NavigationPath()
                serverConfig.clearServerURL()
            }
        }
    }
}

// MARK: - Navigation Destination

enum NavigationDestination: Hashable {
    case sessions(repo: RepoInfo)
    case conversation(sessionId: String)
}

// Make RepoInfo Hashable for navigation
extension RepoInfo: Hashable {
    public static func == (lhs: RepoInfo, rhs: RepoInfo) -> Bool {
        lhs.id == rhs.id
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

// MARK: - Preview

#Preview {
    MainView()
}
