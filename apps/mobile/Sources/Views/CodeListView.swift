//
//  CodeListView.swift
//  Pi
//
//  List of code/project sessions (repo-based)
//

import SwiftUI
import PiCore
import PiUI

struct CodeListView: View {
    @Environment(ServerConnection.self) private var connection
    @State private var path = NavigationPath()
    @State private var sessions: [SessionInfo] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
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
            .navigationTitle("Code")
            .navigationDestination(for: SessionInfo.self) { session in
                SessionConversationView(session: session)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showRepoSelector = true
                    } label: {
                        Image(systemName: "plus.rectangle.on.folder")
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
        .sheet(isPresented: $showRepoSelector) {
            RepoSelectorSheet(connection: connection) { repo in
                Task { await createCodeSession(repoId: repo.id) }
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
            Text("Loading...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Projects", systemImage: "folder")
        } description: {
            Text("Work on code with AI assistance.")
        } actions: {
            Button("New Project") {
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
            let allSessions = try await connection.listSessions()
            sessions = allSessions.filter { $0.resolvedMode == .code }
        } catch {
            errorMessage = error.localizedDescription
            print("[CodeListView] Failed to load sessions: \(error)")
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
            print("[CodeListView] Failed to create session: \(error)")
        }
    }

    private func deleteSession(_ session: SessionInfo) async {
        do {
            try await connection.deleteSession(sessionId: session.sessionId)
            sessions.removeAll { $0.id == session.id }
        } catch {
            errorMessage = error.localizedDescription
            print("[CodeListView] Failed to delete session: \(error)")
        }
    }
}

// MARK: - Preview

#Preview {
    CodeListView()
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:3141")!))
}
