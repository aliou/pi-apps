import Foundation

public struct ModelInfo: Codable, Sendable, Hashable {
    public let provider: String
    public let modelId: String
    public let name: String?
    public let contextWindow: Int?
    public let maxOutput: Int?

    public init(
        provider: String,
        modelId: String,
        name: String? = nil,
        contextWindow: Int? = nil,
        maxOutput: Int? = nil
    ) {
        self.provider = provider
        self.modelId = modelId
        self.name = name
        self.contextWindow = contextWindow
        self.maxOutput = maxOutput
    }
}
