import SwiftUI

/// A row displaying a session's name, mode, status, diff stats, and message preview.
/// Designed for use in session lists on both iOS and macOS.
public struct SessionRowView: View {
    public let id: String
    public let name: String?
    public let firstUserMessage: String?
    public let lastActivityAt: String
    public let mode: SessionModeDisplay
    public let displayInfo: SessionDisplayInfo
    public var showModeIcon: Bool

    public init(
        id: String,
        name: String?,
        firstUserMessage: String? = nil,
        lastActivityAt: String,
        mode: SessionModeDisplay,
        displayInfo: SessionDisplayInfo,
        showModeIcon: Bool = true
    ) {
        self.id = id
        self.name = name
        self.firstUserMessage = firstUserMessage
        self.lastActivityAt = lastActivityAt
        self.mode = mode
        self.displayInfo = displayInfo
        self.showModeIcon = showModeIcon
    }

    /// Display title: name > truncated first user message > session ID.
    private var displayTitle: String {
        if let name, !name.isEmpty {
            return name
        }
        if let firstUserMessage, !firstUserMessage.isEmpty {
            let truncated = firstUserMessage.prefix(80)
            return truncated.count < firstUserMessage.count
                ? truncated + "..."
                : String(truncated)
        }
        return id
    }

    public var body: some View {
        HStack(spacing: 12) {
            if showModeIcon {
                ModeIcon(mode)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(displayTitle)
                        .font(.body)
                        .lineLimit(1)
                    Spacer()
                    HStack(spacing: 6) {
                        Text(Self.relativeDate(lastActivityAt))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if displayInfo.status == .active {
                            StatusIndicator(.active)
                        }
                    }
                }

                if mode == .code {
                    HStack(spacing: 6) {
                        if let repo = displayInfo.repoFullName {
                            Text(repo)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let added = displayInfo.diffAdded, let removed = displayInfo.diffRemoved {
                            DiffStatsBadge(added: added, removed: removed)
                        }
                    }
                }

                if let preview = displayInfo.lastMessagePreview {
                    Text(preview)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    // MARK: - Date formatting

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter
    }()

    static func relativeDate(_ isoString: String) -> String {
        guard let date = isoFormatter.date(from: isoString) else { return isoString }
        return relativeFormatter.localizedString(for: date, relativeTo: .now)
    }
}

#Preview("Code session with diff stats and repo, active") {
    SessionRowView(
        id: "session-001",
        name: "Add dark mode support",
        lastActivityAt: "2026-02-07T21:15:00Z",
        mode: .code,
        displayInfo: SessionDisplayInfo(
            lastMessagePreview: "Let me add the dark mode implementation to the theme file.",
            diffAdded: 45,
            diffRemoved: 12,
            status: .active,
            repoFullName: "aliou/pi-apps"
        )
    )
    .padding()
}

#Preview("Chat session, idle") {
    SessionRowView(
        id: "session-002",
        name: "General discussion",
        lastActivityAt: "2026-02-07T19:30:00Z",
        mode: .chat,
        displayInfo: SessionDisplayInfo(
            lastMessagePreview: "That sounds like a great idea for the project.",
            status: .idle
        )
    )
    .padding()
}

#Preview("Code session with no diff stats") {
    SessionRowView(
        id: "session-003",
        name: "Review documentation",
        lastActivityAt: "2026-02-07T18:45:00Z",
        mode: .code,
        displayInfo: SessionDisplayInfo(
            lastMessagePreview: "I've reviewed the README and API docs.",
            status: .idle,
            repoFullName: "aliou/pi-apps"
        )
    )
    .padding()
}

#Preview("Session with long name") {
    SessionRowView(
        id: "session-004",
        name: "Implement comprehensive authentication system with OAuth2 and JWT token support",
        lastActivityAt: "2026-02-07T20:00:00Z",
        mode: .code,
        displayInfo: SessionDisplayInfo(
            lastMessagePreview: "OAuth2 provider setup is complete.",
            diffAdded: 234,
            diffRemoved: 89,
            status: .idle,
            repoFullName: "aliou/auth-system"
        )
    )
    .padding()
}

#Preview("No name uses first user message") {
    SessionRowView(
        id: "session-005",
        name: nil,
        firstUserMessage: "Please investigate why onboarding hangs after server validation.",
        lastActivityAt: "2026-02-07T20:10:00Z",
        mode: .chat,
        displayInfo: SessionDisplayInfo(status: .idle)
    )
    .padding()
}

#Preview("No name and no first message uses id") {
    SessionRowView(
        id: "session-006",
        name: nil,
        firstUserMessage: nil,
        lastActivityAt: "2026-02-07T20:20:00Z",
        mode: .chat,
        displayInfo: SessionDisplayInfo(status: .idle)
    )
    .padding()
}
