public struct HealthResponse: Codable, Sendable, Hashable {
    public let isHealthy: Bool
    public let version: String

    enum CodingKeys: String, CodingKey {
        case isHealthy = "ok"
        case version
    }

    public init(isHealthy: Bool, version: String) {
        self.isHealthy = isHealthy
        self.version = version
    }
}
