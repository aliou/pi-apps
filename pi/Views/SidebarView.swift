//
//  SidebarView.swift
//  pi
//

import SwiftUI

// MARK: - Sidebar View

struct SidebarView: View {
    let sessions: [Session]
    let selectedSessionId: UUID?
    let onSelectSession: (Session) -> Void
    let onDeleteSession: (Session, Bool) -> Void
    let onNewSession: () -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // New session button
            Button(action: onNewSession) {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .semibold))
                    Text("New session")
                        .font(.system(size: 13, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Theme.accent)
                .foregroundColor(Theme.text)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.top, 36) // Account for titlebar area (28px titlebar + 8px margin)
            .padding(.bottom, 16)
            
            // Sessions header
            HStack {
                Text("Sessions")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Theme.muted)
                    .textCase(.uppercase)
                    .tracking(0.5)
                
                Spacer()
                
                Button(action: {}) {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.muted)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            
            // Sessions list
            ScrollView {
                LazyVStack(spacing: 2) {
                    ForEach(sessions) { session in
                        SessionRow(
                            session: session,
                            isSelected: session.id == selectedSessionId,
                            onSelect: { onSelectSession(session) },
                            onDelete: { deleteWorktree in onDeleteSession(session, deleteWorktree) }
                        )
                    }
                }
                .padding(.horizontal, 8)
            }
            
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.sidebarBg)
    }
}

// MARK: - Session Row

private struct SessionRow: View {
    let session: Session
    let isSelected: Bool
    let onSelect: () -> Void
    let onDelete: (Bool) -> Void
    
    @State private var isHovering = false
    @State private var showDeleteConfirm = false
    @State private var deleteWorktree = false
    
    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(session.title)
                        .font(.system(size: 13))
                        .foregroundColor(Theme.text)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    
                    Spacer(minLength: 4)
                    
                    if isHovering {
                        Button {
                            showDeleteConfirm = true
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(Theme.muted)
                                .frame(width: 16, height: 16)
                                .background(Theme.darkGray)
                                .cornerRadius(3)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(timeAgo(from: session.updatedAt))
                            .font(.system(size: 11))
                            .foregroundColor(Theme.dim)
                    }
                }
                
                Text(session.projectName)
                    .font(.system(size: 11))
                    .foregroundColor(Theme.dim)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rowBackground)
            .cornerRadius(4)
        }
        .buttonStyle(.plain)
        .pointerCursor { hovering in
            isHovering = hovering
        }
        .alert("Delete session?", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) {
                onDelete(deleteWorktree)
                deleteWorktree = false
            }
            Button("Cancel", role: .cancel) {
                deleteWorktree = false
            }
        } message: {
            VStack(alignment: .leading, spacing: 8) {
                Text("This will remove the session from the list.")
                Toggle("Also delete worktree files", isOn: $deleteWorktree)
            }
        }
    }
    
    private var rowBackground: Color {
        if isSelected {
            return Theme.selectedBg
        } else if isHovering {
            return Theme.hoverBg
        } else {
            return .clear
        }
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
    } else if minutes < 60 {
        return "\(minutes)m ago"
    } else if hours < 24 {
        return "\(hours)h ago"
    } else if days < 7 {
        return "\(days)d ago"
    } else if weeks < 4 {
        return "\(weeks)w ago"
    } else if months < 12 {
        return "\(months)mo ago"
    } else {
        return "\(years)y ago"
    }
}

// MARK: - Color Extension

// MARK: - Preview

#Preview {
    SidebarView(
        sessions: [
            Session(
                title: "Implementing user authentication with JWT tokens",
                selectedPath: "/Users/test/Projects/auth-service",
                repoRoot: "/Users/test/Projects/auth-service",
                relativePath: "",
                worktreeName: "wt-abc123",
                createdAt: Date().addingTimeInterval(-3600 * 2),
                updatedAt: Date().addingTimeInterval(-3600 * 2)
            ),
            Session(
                title: "Debug memory leak in image processing",
                selectedPath: "/Users/test/Projects/image-processor/src",
                repoRoot: "/Users/test/Projects/image-processor",
                relativePath: "src",
                worktreeName: "wt-def456",
                createdAt: Date().addingTimeInterval(-86400 * 2),
                updatedAt: Date().addingTimeInterval(-86400 * 2)
            ),
            Session(
                title: "Setup CI/CD pipeline",
                selectedPath: "/Users/test/Projects/devops",
                repoRoot: "/Users/test/Projects/devops",
                relativePath: "",
                worktreeName: "wt-ghi789",
                createdAt: Date().addingTimeInterval(-86400 * 5),
                updatedAt: Date().addingTimeInterval(-86400 * 5)
            )
        ],
        selectedSessionId: nil,
        onSelectSession: { _ in },
        onDeleteSession: { _, _ in },
        onNewSession: {}
    )
    .frame(width: 260, height: 500)
}
