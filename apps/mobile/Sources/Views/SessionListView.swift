//
//  SessionListView.swift
//  Pi
//
//  View for managing sessions within a repository
//

import SwiftUI
import PiCore

struct SessionListView: View {
    let client: RPCClient
    let repoId: String
    let repoName: String
    let onSessionSelected: (String) -> Void

    @State private var sessions: [SessionInfoResult] = []
    @State private var isLoading = true
    @State private var isCreating = false
    @State private var errorMessage: String?
    @State private var sessionToDelete: SessionInfoResult?
    @State private var showDeleteConfirmation = false

    var body: some View {
        ZStack {
            Theme.pageBg.ignoresSafeArea()

            if isLoading && sessions.isEmpty {
                loadingView
            } else if let error = errorMessage, sessions.isEmpty {
                errorView(error)
            } else if sessions.isEmpty {
                emptyStateView
            } else {
                sessionListView
            }
        }
        .navigationTitle(repoName)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                createSessionButton
            }
        }
        .alert("Delete Session", isPresented: $showDeleteConfirmation, presenting: sessionToDelete) { session in
            Button("Cancel", role: .cancel) {
                sessionToDelete = nil
            }
            Button("Delete", role: .destructive) {
                Task {
                    await deleteSession(session.sessionId)
                }
            }
        } message: { _ in
            Text("Are you sure you want to delete this session? This action cannot be undone.")
        }
        .task {
            await loadSessions()
        }
        .refreshable {
            await loadSessions()
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.2)
                .tint(Theme.accent)

            Text("Loading sessions...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.error)

            Text("Failed to Load Sessions")
                .font(.headline)
                .foregroundStyle(Theme.text)

            Text(error)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button(action: { Task { await loadSessions() } }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                    Text("Retry")
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Theme.accent)
                .foregroundStyle(.white)
                .cornerRadius(8)
            }
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48))
                .foregroundStyle(Theme.muted)

            Text("No Sessions Yet")
                .font(.headline)
                .foregroundStyle(Theme.text)

            Text("Create a new session to start a conversation with the AI assistant.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button(action: { Task { await createSession() } }) {
                HStack(spacing: 8) {
                    if isCreating {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.8)
                            .tint(.white)
                    } else {
                        Image(systemName: "plus.circle.fill")
                    }
                    Text(isCreating ? "Creating..." : "Create Session")
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(isCreating ? Theme.muted : Theme.accent)
                .foregroundStyle(.white)
                .cornerRadius(8)
            }
            .disabled(isCreating)
        }
    }

    private var sessionListView: some View {
        List {
            ForEach(sessions) { session in
                SessionRowView(session: session)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onSessionSelected(session.sessionId)
                    }
                    .listRowBackground(Theme.cardBg)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            sessionToDelete = session
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private var createSessionButton: some View {
        Button(action: { Task { await createSession() } }) {
            if isCreating {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(0.8)
                    .tint(Theme.accent)
            } else {
                Image(systemName: "plus")
                    .fontWeight(.semibold)
            }
        }
        .disabled(isCreating)
    }

    // MARK: - Data Operations

    private func loadSessions() async {
        isLoading = true
        errorMessage = nil

        do {
            let loadedSessions = try await client.listSessions(repoId: repoId)
            // Sort by creation date, newest first
            sessions = loadedSessions.sorted { session1, session2 in
                guard let date1 = session1.createdAt else { return false }
                guard let date2 = session2.createdAt else { return true }
                return date1 > date2
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    private func createSession() async {
        isCreating = true
        errorMessage = nil

        do {
            let result = try await client.createSession(repoId: repoId)
            // Reload sessions to get the new one with full info
            await loadSessions()
            // Navigate to the new session
            onSessionSelected(result.sessionId)
        } catch {
            errorMessage = error.localizedDescription
        }

        isCreating = false
    }

    private func deleteSession(_ sessionId: String) async {
        do {
            try await client.deleteSession(sessionId: sessionId)
            // Remove from local state
            sessions.removeAll { $0.sessionId == sessionId }
        } catch {
            errorMessage = error.localizedDescription
        }

        sessionToDelete = nil
    }
}

// MARK: - Session Row View

private struct SessionRowView: View {
    let session: SessionInfoResult

    var body: some View {
        HStack(spacing: 12) {
            // Session icon
            ZStack {
                Circle()
                    .fill(Theme.accent.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: "bubble.left.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.accent)
            }

            // Session info
            VStack(alignment: .leading, spacing: 4) {
                Text(truncatedSessionId)
                    .font(.headline)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)

                if let createdAt = session.createdAt {
                    Text(formatDate(createdAt))
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                }

                if let lastActivity = session.lastActivityAt, lastActivity != session.createdAt {
                    Text("Last active: \(formatRelativeDate(lastActivity))")
                        .font(.caption2)
                        .foregroundStyle(Theme.dim)
                }
            }

            Spacer()

            // Chevron indicator
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 8)
    }

    private var truncatedSessionId: String {
        let id = session.sessionId
        if id.count > 12 {
            return String(id.prefix(8)) + "..."
        }
        return id
    }

    private func formatDate(_ dateString: String) -> String {
        // Try to parse ISO 8601 date
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: dateString) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return "Created \(displayFormatter.string(from: date))"
        }

        // Fallback: try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: dateString) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return "Created \(displayFormatter.string(from: date))"
        }

        return "Created \(dateString)"
    }

    private func formatRelativeDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        var date = formatter.date(from: dateString)

        // Fallback: try without fractional seconds
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: dateString)
        }

        guard let parsedDate = date else {
            return dateString
        }

        let relativeFormatter = RelativeDateTimeFormatter()
        relativeFormatter.unitsStyle = .short
        return relativeFormatter.localizedString(for: parsedDate, relativeTo: Date())
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SessionListView(
            client: RPCClient(serverURL: URL(string: "ws://localhost:3000")!),
            repoId: "test-repo",
            repoName: "Test Repository"
        ) { sessionId in
            print("Selected session: \(sessionId)")
        }
    }
}
