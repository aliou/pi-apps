import Foundation

extension Relay {
    public struct SecretInfo: Codable, Sendable, Hashable, Identifiable {
        public let id: String
        public let name: String
        public let envVar: String
        public let kind: SecretKind
        public let enabled: Bool
        public let createdAt: String
        public let updatedAt: String
        public let keyVersion: Int

        public init(
            id: String,
            name: String,
            envVar: String,
            kind: SecretKind,
            enabled: Bool,
            createdAt: String,
            updatedAt: String,
            keyVersion: Int
        ) {
            self.id = id
            self.name = name
            self.envVar = envVar
            self.kind = kind
            self.enabled = enabled
            self.createdAt = createdAt
            self.updatedAt = updatedAt
            self.keyVersion = keyVersion
        }
    }
}
