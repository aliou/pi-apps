import SwiftUI
import PiCore

struct SidebarView: View {
    let sessions: [SessionDisplayInfo]
    let selectedSessionId: String?
    let onSelectSession: (String) -> Void
    let onDeleteSession: (String) -> Void
    let onNewChat: () -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with title and close button
            HStack {
                Text("Pi")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundStyle(Theme.text)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(width: 32, height: 32)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 16)

            // Sessions list
            if sessions.isEmpty {
                emptyState
            } else {
                sessionsList
            }

            Spacer(minLength: 0)

            // New chat button at bottom
            Button(action: onNewChat) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("New Chat")
                }
                .font(.headline)
                .foregroundStyle(Theme.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.sidebarBg)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 32))
                .foregroundStyle(Theme.muted)

            Text("No conversations yet")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)

            Text("Start a new chat to begin")
                .font(.caption)
                .foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Sessions List

    private var sessionsList: some View {
        List {
            ForEach(sessions) { session in
                SessionRowView(title: session.title, repoName: session.repoName)
                    .listRowBackground(session.id == selectedSessionId ? Theme.selectedBg : Theme.sidebarBg)
                    .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 20))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onSelectSession(session.id)
                        onClose()
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            onDeleteSession(session.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }
}

// Helper type for displaying sessions
struct SessionDisplayInfo: Identifiable {
    let id: String
    let title: String
    let repoName: String
}

// MARK: - Previews

#Preview("With Sessions") {
    SidebarView(
        sessions: [
            SessionDisplayInfo(id: "1", title: "Create evidence extension for docume...", repoName: "aliou/pi-extensions"),
            SessionDisplayInfo(id: "2", title: "Add CI checks for builds and packages", repoName: "aliou/pi-apps"),
            SessionDisplayInfo(id: "3", title: "Create Pi-hole service in Docker with P...", repoName: "378labs/homelab"),
            SessionDisplayInfo(id: "4", title: "Vendor coding agent session search", repoName: "378labs/pkgs")
        ],
        selectedSessionId: "2",
        onSelectSession: { _ in },
        onDeleteSession: { _ in },
        onNewChat: {},
        onClose: {}
    )
    .frame(width: 320)
}

#Preview("Empty State") {
    SidebarView(
        sessions: [],
        selectedSessionId: nil,
        onSelectSession: { _ in },
        onDeleteSession: { _ in },
        onNewChat: {},
        onClose: {}
    )
    .frame(width: 320)
}

#Preview("Dark Mode") {
    SidebarView(
        sessions: [
            SessionDisplayInfo(id: "1", title: "Create evidence extension", repoName: "aliou/pi-extensions"),
            SessionDisplayInfo(id: "2", title: "Add CI checks for builds", repoName: "aliou/pi-apps")
        ],
        selectedSessionId: "1",
        onSelectSession: { _ in },
        onDeleteSession: { _ in },
        onNewChat: {},
        onClose: {}
    )
    .frame(width: 320)
    .preferredColorScheme(.dark)
}
