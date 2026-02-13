extension Relay {
    // MARK: - Session Enums

    public enum SessionStatus: String, Codable, Sendable, Hashable {
        case creating
        case active
        case idle
        case archived
        case error
    }

    public enum SessionMode: String, Codable, Sendable, Hashable {
        case chat
        case code
    }

    // MARK: - Sandbox Enums

    public enum SandboxProviderType: String, Codable, Sendable, Hashable {
        case mock
        case docker
        case cloudflare
        case gondolin
    }

    public enum SandboxStatus: String, Codable, Sendable, Hashable {
        case creating
        case running
        case paused
        case stopped
        case error
    }

    public enum SandboxType: String, Codable, Sendable, Hashable {
        case docker
        case cloudflare
        case gondolin
    }

    public enum SandboxResourceTier: String, Codable, Sendable, Hashable {
        case small
        case medium
        case large
    }

    // MARK: - Secret Enums

    public enum SecretKind: String, Codable, Sendable, Hashable {
        case aiProvider = "ai_provider"
        case envVar = "env_var"
        case sandboxProvider = "sandbox_provider"
    }
}
