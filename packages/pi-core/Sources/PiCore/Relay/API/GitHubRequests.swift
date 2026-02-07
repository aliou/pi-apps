import Foundation

extension Relay {
    public struct SetGitHubTokenRequest: Codable, Sendable {
        public let token: String

        public init(token: String) {
            self.token = token
        }
    }

    public struct SetGitHubTokenResponse: Codable, Sendable, Hashable {
        public let user: String?
        public let scopes: [String]?

        public init(user: String? = nil, scopes: [String]? = nil) {
            self.user = user
            self.scopes = scopes
        }
    }
}
