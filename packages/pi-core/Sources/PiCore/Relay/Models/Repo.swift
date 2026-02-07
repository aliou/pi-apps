import Foundation

extension Relay {
    public struct GitHubRepo: Codable, Sendable, Hashable, Identifiable {
        public let id: Int
        public let name: String
        public let fullName: String
        public let owner: String
        public let isPrivate: Bool
        public let description: String?
        public let htmlUrl: String
        public let cloneUrl: String
        public let sshUrl: String
        public let defaultBranch: String

        public init(
            id: Int,
            name: String,
            fullName: String,
            owner: String,
            isPrivate: Bool,
            description: String? = nil,
            htmlUrl: String,
            cloneUrl: String,
            sshUrl: String,
            defaultBranch: String
        ) {
            self.id = id
            self.name = name
            self.fullName = fullName
            self.owner = owner
            self.isPrivate = isPrivate
            self.description = description
            self.htmlUrl = htmlUrl
            self.cloneUrl = cloneUrl
            self.sshUrl = sshUrl
            self.defaultBranch = defaultBranch
        }
    }
}
