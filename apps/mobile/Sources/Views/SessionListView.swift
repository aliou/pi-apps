//
//  SessionListView.swift
//  Pi
//
//  Unified session list with segmented control for Chat/Code modes
//

import SwiftUI
import PiCore
import PiUI

struct SessionListView: View {
    @Environment(ServerConnection.self) private var connection
    @State private var settings = AppSettings.shared
    @State private var selectedMode: SessionMode = .chat
    @State private var path = NavigationPath()
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showSettings = false
    @State private var showRepoSelector = false

    private var filteredSessions: [SessionInfo] {
        sessions.filter { $0.resolvedMode == selectedMode }
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                // Segmented control
                Picker("Mode", selection: $selectedMode) {
                    Text("Chat").tag(SessionMode.chat)
                    Text("Code").tag(SessionMode.code)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                // Content
                Group {
                    if isLoading && sessions.isEmpty {
                        loadingView
                    } else if filteredSessions.isEmpty {
                        emptyStateView
                    } else {
                        sessionList
                    }
                }
            }
            .navigationTitle("Pi")
            .navigationDestination(for: SessionInfo.self) { session in
                SessionConversationView(session: session)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        if selectedMode == .chat {
                            Task { await createChatSession() }
                        } else {
                            showRepoSelector = true
                        }
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
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showRepoSelector) {
            RepoSelectorSheet(connection: connection) { repo in
                Task { await createCodeSession(repoId: repo.id) }
            }
        }
    }

    // MARK: - Session List

    private var sessionList: some View {
        List {
            ForEach(filteredSessions) { session in
                NavigationLink(value: session) {
                    SessionRowView(
                        name: session.displayName,
                        repoName: session.repoId ?? "Chat",
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
            Label(
                selectedMode == .chat ? "No Chats" : "No Projects",
                systemImage: selectedMode == .chat ? "bubble.left.and.bubble.right" : "folder"
            )
        } description: {
            Text(selectedMode == .chat
                ? "Start a conversation without needing a codebase."
                : "Work on code with AI assistance.")
        } actions: {
            Button(selectedMode == .chat ? "New Chat" : "New Project") {
                if selectedMode == .chat {
                    Task { await createChatSession() }
                } else {
                    showRepoSelector = true
                }
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

    private func createChatSession() async {
        do {
            let result = try await connection.createChatSession(
                systemPrompt: settings.effectiveChatSystemPrompt
            )

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
            print("[SessionListView] Failed to create chat session: \(error)")
        }
    }

    private func createCodeSession(repoId: String) async {
        do {
            let result = try await connection.createCodeSession(repoId: repoId)

            let newSession = SessionInfo(
                sessionId: result.sessionId,
                mode: .code,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                lastActivityAt: nil,
                name: nil,
                repoId: repoId
            )

            await loadSessions()

            if let session = sessions.first(where: { $0.sessionId == result.sessionId }) {
                path.append(session)
            } else {
                path.append(newSession)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[SessionListView] Failed to create code session: \(error)")
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
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:3141")!))
}
