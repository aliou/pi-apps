//
//  SessionHistorySheet.swift
//  Pi
//
//  Sheet showing list of sessions (Chat or Code), ordered by date.
//

import SwiftUI
import PiCore

struct SessionHistoryItem: Identifiable {
    let id: String
    let title: String?
    let firstMessage: String?
    let repoName: String?
    let mode: SessionMode
    let lastActivityAt: Date

    var displayTitle: String {
        if let title, !title.isEmpty {
            return title
        }
        if let firstMessage, !firstMessage.isEmpty {
            let truncated = firstMessage.prefix(50)
            return truncated.count < firstMessage.count ? "\(truncated)..." : String(truncated)
        }
        return mode == .chat ? "New Chat" : "New Code Session"
    }
}

struct SessionHistorySheet: View {
    let mode: SessionMode
    let sessions: [SessionHistoryItem]
    let onSelect: (SessionHistoryItem) -> Void
    let onDelete: (SessionHistoryItem) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if sessions.isEmpty {
                    emptyState
                } else {
                    sessionList
                }
            }
            .navigationTitle(mode == .chat ? "Chats" : "Code Sessions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label(
                mode == .chat ? "No Chats" : "No Code Sessions",
                systemImage: mode == .chat ? "bubble.left" : "chevron.left.forwardslash.chevron.right"
            )
        } description: {
            Text(mode == .chat ? "Start a new chat to begin" : "Start a new code session to begin")
        }
    }

    private var sessionList: some View {
        List {
            ForEach(groupedSessions, id: \.0) { section, items in
                Section(section) {
                    ForEach(items) { session in
                        SessionHistoryRow(session: session) {
                            onSelect(session)
                            dismiss()
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                onDelete(session)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
    }

    private var groupedSessions: [(String, [SessionHistoryItem])] {
        let calendar = Calendar.current
        let now = Date()

        let grouped = Dictionary(grouping: sessions) { session -> String in
            if calendar.isDateInToday(session.lastActivityAt) {
                return "Today"
            }
            if calendar.isDateInYesterday(session.lastActivityAt) {
                return "Yesterday"
            }
            if let weekAgo = calendar.date(byAdding: .day, value: -7, to: now),
               session.lastActivityAt > weekAgo {
                return "This Week"
            }
            if let monthAgo = calendar.date(byAdding: .month, value: -1, to: now),
               session.lastActivityAt > monthAgo {
                return "This Month"
            }
            return "Older"
        }

        let order = ["Today", "Yesterday", "This Week", "This Month", "Older"]
        return order.compactMap { key in
            guard let items = grouped[key] else { return nil }
            let sorted = items.sorted { $0.lastActivityAt > $1.lastActivityAt }
            return (key, sorted)
        }
    }
}

struct SessionHistoryRow: View {
    let session: SessionHistoryItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(session.displayTitle)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let repoName = session.repoName {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.triangle.branch")
                            Text(repoName)
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }

                    Text(session.lastActivityAt, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sample Data

extension SessionHistoryItem {
    static let sampleChatSessions: [SessionHistoryItem] = [
        SessionHistoryItem(
            id: "1",
            title: "SwiftUI Layout Help",
            firstMessage: nil,
            repoName: nil,
            mode: .chat,
            lastActivityAt: Date()
        ),
        SessionHistoryItem(
            id: "2",
            title: nil,
            firstMessage: "Can you explain how async/await works in Swift?",
            repoName: nil,
            mode: .chat,
            lastActivityAt: Date().addingTimeInterval(-3600)
        ),
        SessionHistoryItem(
            id: "3",
            title: nil,
            firstMessage: "Help me write a professional email to decline a meeting",
            repoName: nil,
            mode: .chat,
            lastActivityAt: Date().addingTimeInterval(-86400)
        ),
        SessionHistoryItem(
            id: "4",
            title: "API Design Discussion",
            firstMessage: nil,
            repoName: nil,
            mode: .chat,
            lastActivityAt: Date().addingTimeInterval(-172800)
        )
    ]

    static let sampleCodeSessions: [SessionHistoryItem] = [
        SessionHistoryItem(
            id: "1",
            title: "Fix navigation bug",
            firstMessage: nil,
            repoName: "aliou/pi-apps",
            mode: .code,
            lastActivityAt: Date()
        ),
        SessionHistoryItem(
            id: "2",
            title: nil,
            firstMessage: "Add unit tests for the SessionManager class",
            repoName: "aliou/pi-apps",
            mode: .code,
            lastActivityAt: Date().addingTimeInterval(-7200)
        ),
        SessionHistoryItem(
            id: "3",
            title: "Refactor auth flow",
            firstMessage: nil,
            repoName: "anthropic/claude-code",
            mode: .code,
            lastActivityAt: Date().addingTimeInterval(-259200)
        ),
        SessionHistoryItem(
            id: "4",
            title: nil,
            firstMessage: "Implement dark mode support across all views",
            repoName: "mariozechner/pi-mono",
            mode: .code,
            lastActivityAt: Date().addingTimeInterval(-604800)
        )
    ]
}

// MARK: - Previews

#Preview("Chat History") {
    SessionHistorySheet(
        mode: .chat,
        sessions: SessionHistoryItem.sampleChatSessions,
        onSelect: { session in print("Selected: \(session.id)") }
    ) { session in
        print("Delete: \(session.id)")
    }
}

#Preview("Code Sessions") {
    SessionHistorySheet(
        mode: .code,
        sessions: SessionHistoryItem.sampleCodeSessions,
        onSelect: { session in print("Selected: \(session.id)") }
    ) { session in
        print("Delete: \(session.id)")
    }
}

#Preview("Empty Chat History") {
    SessionHistorySheet(
        mode: .chat,
        sessions: [],
        onSelect: { _ in }
    ) { _ in }
}

#Preview("Empty Code Sessions") {
    SessionHistorySheet(
        mode: .code,
        sessions: [],
        onSelect: { _ in }
    ) { _ in }
}
