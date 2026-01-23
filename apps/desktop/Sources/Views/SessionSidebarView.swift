//
//  SessionSidebarView.swift
//  pi
//
//  NavigationSplitView sidebar with mode switching
//

import SwiftUI
import PiCore
import PiUI

// MARK: - Custom Segmented Control

struct FullWidthSegmentedControl<T: Hashable & CaseIterable & Identifiable>: View where T.AllCases: RandomAccessCollection {
    @Binding var selection: T
    let label: (T) -> String

    @Namespace private var animation

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(T.allCases)) { option in
                segmentButton(for: option)
            }
        }
        .padding(3)
        .background(Color(nsColor: .separatorColor).opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func segmentButton(for option: T) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.15)) {
                selection = option
            }
        } label: {
            Text(label(option))
                .font(.system(size: 12, weight: selection == option ? .medium : .regular))
                .foregroundColor(Color(nsColor: .labelColor))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background {
                    if selection == option {
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color(nsColor: .controlColor))
                            .shadow(color: .black.opacity(0.15), radius: 1, y: 1)
                            .matchedGeometryEffect(id: "selection", in: animation)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sidebar View

struct SessionSidebarView: View {
    let sessionManager: SessionManager
    @Binding var sidebarMode: SidebarMode
    let onNewChat: () -> Void
    let onNewCodeSession: () -> Void
    let onDeleteSession: (UUID, Bool) -> Void

    @State private var sessionToDelete: DesktopSession?
    @State private var showDeleteConfirm = false
    @State private var deleteWorktree = false

    private var currentSessions: [DesktopSession] {
        switch sidebarMode {
        case .chat:
            return sessionManager.chatSessions
        case .code:
            return sessionManager.codeSessions
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Mode segmented control
            FullWidthSegmentedControl(selection: $sidebarMode) { mode in
                mode.rawValue
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
            .padding(.bottom, 8)

            // New session button
            newSessionButton
                .padding(.horizontal, 12)
                .padding(.bottom, 8)

            Divider()

            // Sessions list
            sessionsList
        }
        .navigationTitle(sidebarMode == .chat ? "Chats" : "Code")
        .alert("Delete session?", isPresented: $showDeleteConfirm, presenting: sessionToDelete) { session in
            Button("Delete", role: .destructive) {
                onDeleteSession(session.id, deleteWorktree)
                deleteWorktree = false
                sessionToDelete = nil
            }
            Button("Cancel", role: .cancel) {
                deleteWorktree = false
                sessionToDelete = nil
            }
        } message: { session in
            VStack(alignment: .leading, spacing: 8) {
                Text("This will remove \"\(session.displayTitle)\" from the list.")
                if session.connectionType == .local && session.mode == .code {
                    Toggle("Also delete worktree files", isOn: $deleteWorktree)
                }
            }
        }
    }

    @ViewBuilder
    private var newSessionButton: some View {
        Button {
            if sidebarMode == .chat {
                onNewChat()
            } else {
                onNewCodeSession()
            }
        } label: {
            Label(
                sidebarMode == .chat ? "New Chat" : "New Code Session",
                systemImage: sidebarMode == .chat ? "plus.bubble" : "plus.rectangle.on.folder"
            )
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.regular)
    }

    @ViewBuilder
    private var sessionsList: some View {
        if currentSessions.isEmpty {
            emptyState
        } else {
            List(selection: Binding(
                get: { sessionManager.activeSessionId },
                set: { id in
                    if let id {
                        Task { await sessionManager.selectSession(id) }
                    }
                }
            )) {
                ForEach(currentSessions) { session in
                    SessionRowView(session: session)
                        .tag(session.id)
                        .contextMenu {
                            Button("Delete", role: .destructive) {
                                sessionToDelete = session
                                showDeleteConfirm = true
                            }
                        }
                }
            }
            .listStyle(.sidebar)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: sidebarMode == .chat ? "bubble.left" : "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)

            Text(sidebarMode == .chat ? "No chats yet" : "No code sessions yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(sidebarMode == .chat
                ? "Start a conversation with Pi"
                : "Open a project folder to begin")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Session Row View

struct SessionRowView: View {
    let session: DesktopSession

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(session.displayTitle)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 4)

                Text(timeAgo(from: session.updatedAt))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            if let projectName = session.projectName {
                Text(projectName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if let repoName = session.repoName {
                Text(repoName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Helpers

private func timeAgo(from date: Date) -> String {
    let now = Date()
    let interval = now.timeIntervalSince(date)

    let seconds = Int(interval)
    let minutes = seconds / 60
    let hours = minutes / 60
    let days = hours / 24
    let weeks = days / 7
    let months = days / 30
    let years = days / 365

    if seconds < 60 {
        return "now"
    }
    if minutes < 60 {
        return "\(minutes)m"
    }
    if hours < 24 {
        return "\(hours)h"
    }
    if days < 7 {
        return "\(days)d"
    }
    if weeks < 4 {
        return "\(weeks)w"
    }
    if months < 12 {
        return "\(months)mo"
    }
    return "\(years)y"
}

// MARK: - Preview

#Preview {
    @Previewable @State var mode: SidebarMode = .chat

    SessionSidebarView(
        sessionManager: SessionManager(),
        sidebarMode: $mode,
        onNewChat: {},
        onNewCodeSession: {},
        onDeleteSession: { _, _ in }
    )
    .frame(width: 250, height: 400)
}
