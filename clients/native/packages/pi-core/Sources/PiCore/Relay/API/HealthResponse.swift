extension Relay {
    public struct HealthResponse: Codable, Sendable, Hashable {
        public let isHealthy: Bool
        public let version: String

        public init(isHealthy: Bool, version: String) {
            self.isHealthy = isHealthy
            self.version = version
        }
    }
}

extension Relay.HealthResponse {
    enum CodingKeys: String, CodingKey {
        case isHealthy = "ok"
        case version
    }
}
