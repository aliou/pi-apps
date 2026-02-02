import Foundation

struct ChatSession: Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var createdAt: Date

    static func fresh() -> ChatSession {
        ChatSession(id: UUID(), title: "New Session", createdAt: Date())
    }
}

enum ChatRole: String, Codable, Sendable {
    case user
    case assistant
    case system
}

struct ChatMessage: Identifiable, Hashable, Sendable {
    let id: UUID
    let role: ChatRole
    let content: String
    let timestamp: Date

    init(id: UUID = UUID(), role: ChatRole, content: String, timestamp: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}
