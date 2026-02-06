import Foundation

public struct RelayEnvironment: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let sandboxType: SandboxType
    public let config: EnvironmentConfig
    public let isDefault: Bool
    public let createdAt: String
    public let updatedAt: String

    public init(
        id: String,
        name: String,
        sandboxType: SandboxType,
        config: EnvironmentConfig,
        isDefault: Bool,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.name = name
        self.sandboxType = sandboxType
        self.config = config
        self.isDefault = isDefault
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct EnvironmentConfig: Codable, Sendable, Hashable {
    public let image: String?
    public let workerUrl: String?
    public let secretId: String?
    public let resourceTier: SandboxResourceTier?

    public init(
        image: String? = nil,
        workerUrl: String? = nil,
        secretId: String? = nil,
        resourceTier: SandboxResourceTier? = nil
    ) {
        self.image = image
        self.workerUrl = workerUrl
        self.secretId = secretId
        self.resourceTier = resourceTier
    }
}

public struct AvailableImage: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let image: String
    public let description: String

    public init(
        id: String,
        name: String,
        image: String,
        description: String
    ) {
        self.id = id
        self.name = name
        self.image = image
        self.description = description
    }
}
