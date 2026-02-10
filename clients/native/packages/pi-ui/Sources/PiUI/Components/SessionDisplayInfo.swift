import Foundation

/// Display-level metadata for a session row. Decoupled from PiCore models
/// so PiUI has no dependency on PiCore.
public struct SessionDisplayInfo: Sendable {
    public let lastMessagePreview: String?
    public let diffAdded: Int?
    public let diffRemoved: Int?
    public let status: SessionDisplayStatus
    public let repoFullName: String?

    public init(
        lastMessagePreview: String? = nil,
        diffAdded: Int? = nil,
        diffRemoved: Int? = nil,
        status: SessionDisplayStatus = .idle,
        repoFullName: String? = nil
    ) {
        self.lastMessagePreview = lastMessagePreview
        self.diffAdded = diffAdded
        self.diffRemoved = diffRemoved
        self.status = status
        self.repoFullName = repoFullName
    }

    public static let empty = SessionDisplayInfo()
}
