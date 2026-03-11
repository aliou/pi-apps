import Foundation

extension Relay {
    public struct ModelInfo: Codable, Sendable, Hashable {
        public let provider: String
        public let id: String
        public let name: String?
        public let contextWindow: Int?
        public let maxOutput: Int?

        public init(
            provider: String,
            id: String,
            name: String? = nil,
            contextWindow: Int? = nil,
            maxOutput: Int? = nil
        ) {
            self.provider = provider
            self.id = id
            self.name = name
            self.contextWindow = contextWindow
            self.maxOutput = maxOutput
        }
    }
}
