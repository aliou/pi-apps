//
//  ChatListView.swift
//  Pi
//
//  List of chat sessions (no repo required)
//

import SwiftUI
import PiCore
import PiUI

struct ChatListView: View {
    @Environment(ServerConnection.self) private var connection
    @State private var path = NavigationPath()
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showSettings = false

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
            .navigationTitle("Chat")
            .navigationDestination(for: SessionInfo.self) { session in
                SessionConversationView(session: session)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await createChatSession() }
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
                    Task { await connection.disconnect() }
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showSettings = false }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Session List

    private var sessionList: some View {
        List {
            ForEach(sessions) { session in
                NavigationLink(value: session) {
                    SessionRowView(
                        name: session.displayName,
                        repoName: "Chat",
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
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Chats", systemImage: "bubble.left.and.bubble.right")
        } description: {
            Text("Start a conversation without needing a codebase.")
        } actions: {
            Button("New Chat") {
                Task { await createChatSession() }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Actions

    private func loadSessions() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let allSessions = try await connection.listSessions()
            sessions = allSessions.filter { $0.resolvedMode == .chat }
        } catch {
            errorMessage = error.localizedDescription
            print("[ChatListView] Failed to load sessions: \(error)")
        }
    }

    private func createChatSession() async {
        do {
            let result = try await connection.createChatSession()

            let newSession = SessionInfo(
                sessionId: result.sessionId,
                mode: .chat,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                lastActivityAt: nil,
                name: nil,
                repoId: nil
            )

            await loadSessions()

            if let session = sessions.first(where: { $0.sessionId == result.sessionId }) {
                path.append(session)
            } else {
                path.append(newSession)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ChatListView] Failed to create session: \(error)")
        }
    }

    private func deleteSession(_ session: SessionInfo) async {
        do {
            try await connection.deleteSession(sessionId: session.sessionId)
            sessions.removeAll { $0.id == session.id }
        } catch {
            errorMessage = error.localizedDescription
            print("[ChatListView] Failed to delete session: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    ChatListView()
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:3141")!))
}
