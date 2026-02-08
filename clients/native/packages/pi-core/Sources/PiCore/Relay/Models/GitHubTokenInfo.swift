import Foundation

extension Relay {
    public struct GitHubTokenStatus: Codable, Sendable, Hashable {
        public let configured: Bool
        public let valid: Bool?
        public let user: String?
        public let scopes: [String]?
        public let rateLimitRemaining: Int?
        public let error: String?

        public init(
            configured: Bool,
            valid: Bool? = nil,
            user: String? = nil,
            scopes: [String]? = nil,
            rateLimitRemaining: Int? = nil,
            error: String? = nil
        ) {
            self.configured = configured
            self.valid = valid
            self.user = user
            self.scopes = scopes
            self.rateLimitRemaining = rateLimitRemaining
            self.error = error
        }
    }
}
