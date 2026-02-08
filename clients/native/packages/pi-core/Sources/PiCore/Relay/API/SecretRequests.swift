import Foundation

extension Relay {
    public struct CreateSecretRequest: Codable, Sendable {
        public let name: String
        public let envVar: String
        public let kind: SecretKind
        public let value: String
        public let enabled: Bool?

        public init(
            name: String,
            envVar: String,
            kind: SecretKind,
            value: String,
            enabled: Bool? = nil
        ) {
            self.name = name
            self.envVar = envVar
            self.kind = kind
            self.value = value
            self.enabled = enabled
        }
    }

    public struct UpdateSecretRequest: Codable, Sendable {
        public let name: String?
        public let envVar: String?
        public let kind: SecretKind?
        public let enabled: Bool?
        public let value: String?

        public init(
            name: String? = nil,
            envVar: String? = nil,
            kind: SecretKind? = nil,
            enabled: Bool? = nil,
            value: String? = nil
        ) {
            self.name = name
            self.envVar = envVar
            self.kind = kind
            self.enabled = enabled
            self.value = value
        }
    }
}
