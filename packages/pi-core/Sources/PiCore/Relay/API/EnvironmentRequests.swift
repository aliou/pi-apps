import Foundation

public struct CreateEnvironmentRequest: Codable, Sendable {
    public let name: String
    public let sandboxType: SandboxType
    public let config: EnvironmentConfig
    public let isDefault: Bool?

    public init(
        name: String,
        sandboxType: SandboxType,
        config: EnvironmentConfig,
        isDefault: Bool? = nil
    ) {
        self.name = name
        self.sandboxType = sandboxType
        self.config = config
        self.isDefault = isDefault
    }
}

public struct UpdateEnvironmentRequest: Codable, Sendable {
    public let name: String?
    public let sandboxType: SandboxType?
    public let config: EnvironmentConfig?
    public let isDefault: Bool?

    public init(
        name: String? = nil,
        sandboxType: SandboxType? = nil,
        config: EnvironmentConfig? = nil,
        isDefault: Bool? = nil
    ) {
        self.name = name
        self.sandboxType = sandboxType
        self.config = config
        self.isDefault = isDefault
    }
}

public struct ProbeEnvironmentRequest: Codable, Sendable {
    public let sandboxType: SandboxType
    public let config: EnvironmentConfig

    public init(
        sandboxType: SandboxType,
        config: EnvironmentConfig
    ) {
        self.sandboxType = sandboxType
        self.config = config
    }
}

public struct ProbeEnvironmentResponse: Codable, Sendable, Hashable {
    public let available: Bool
    public let sandboxType: SandboxType?
    public let error: String?

    public init(
        available: Bool,
        sandboxType: SandboxType? = nil,
        error: String? = nil
    ) {
        self.available = available
        self.sandboxType = sandboxType
        self.error = error
    }
}
