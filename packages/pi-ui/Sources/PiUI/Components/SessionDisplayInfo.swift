import Foundation

/// Display-level metadata for a session row. Decoupled from PiCore models
/// so PiUI has no dependency on PiCore.
public struct SessionDisplayInfo: Sendable {
    public let lastMessagePreview: String?
    public let diffAdded: Int?
    public let diffRemoved: Int?
    public let isAgentRunning: Bool
    public let repoFullName: String?

    public var displayStatus: SessionStatusDisplay {
        if isAgentRunning {
            return .active
        } else {
            return .idle
        }
    }

    public init(
        lastMessagePreview: String? = nil,
        diffAdded: Int? = nil,
        diffRemoved: Int? = nil,
        isAgentRunning: Bool = false,
        repoFullName: String? = nil
    ) {
        self.lastMessagePreview = lastMessagePreview
        self.diffAdded = diffAdded
        self.diffRemoved = diffRemoved
        self.isAgentRunning = isAgentRunning
        self.repoFullName = repoFullName
    }

    public static let empty = SessionDisplayInfo()
}
