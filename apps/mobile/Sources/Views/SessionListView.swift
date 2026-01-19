//
//  SessionListView.swift
//  Pi
//
//  NavigationStack-based session list for iOS 26
//

import SwiftUI
import PiCore
import PiUI

struct SessionListView: View {
    @Environment(ServerConnection.self) private var connection
    @State private var path = NavigationPath()
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Sheet states
    @State private var showSettings = false
    @State private var showRepoSelector = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if isLoading && sessions.isEmpty {
                    loadingView
                } else if sessions.isEmpty {
                    emptyStateView
                } else {
                    sessionList
                }
            }
            .navigationTitle("Chats")
            .navigationDestination(for: SessionInfo.self) { session in
                SessionConversationView(session: session)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showRepoSelector = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                }

                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
            .refreshable {
                await loadSessions()
            }
            .task {
                await loadSessions()
            }
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView(serverURL: connection.serverURL) {
                    showSettings = false
                    Task {
                        await connection.disconnect()
                    }
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            showSettings = false
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $showRepoSelector) {
            RepoSelectorSheet(connection: connection) { repo in
                Task {
                    await createSession(repoId: repo.id)
                }
            }
        }
    }

    // MARK: - Session List

    private var sessionList: some View {
        List {
            ForEach(sessions) { session in
                NavigationLink(value: session) {
                    SessionRowView(
                        name: session.displayName,
                        repoName: session.repoId ?? "Unknown",
                        lastActivity: session.lastActivityDate
                    )
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Task { await deleteSession(session) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading sessions...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Chats", systemImage: "bubble.left.and.bubble.right")
        } description: {
            Text("Start a new conversation to get started.")
        } actions: {
            Button("New Chat") {
                showRepoSelector = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Actions

    private func loadSessions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            sessions = try await connection.listSessions()
        } catch {
            errorMessage = error.localizedDescription
            print("[SessionListView] Failed to load sessions: \(error)")
        }
    }

    private func createSession(repoId: String) async {
        do {
            let result = try await connection.createCodeSession(repoId: repoId)

            // Create a SessionInfo from the result and navigate to it
            let newSession = SessionInfo(
                sessionId: result.sessionId,
                mode: .code,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                lastActivityAt: nil,
                name: nil,
                repoId: repoId
            )

            // Reload sessions to include the new one
            await loadSessions()

            // Navigate to the new session
            if let session = sessions.first(where: { $0.sessionId == result.sessionId }) {
                path.append(session)
            } else {
                // Fallback if not found in list
                path.append(newSession)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[SessionListView] Failed to create session: \(error)")
        }
    }

    private func deleteSession(_ session: SessionInfo) async {
        do {
            try await connection.deleteSession(sessionId: session.sessionId)
            sessions.removeAll { $0.id == session.id }
        } catch {
            errorMessage = error.localizedDescription
            print("[SessionListView] Failed to delete session: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    SessionListView()
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:8080")!))
}
