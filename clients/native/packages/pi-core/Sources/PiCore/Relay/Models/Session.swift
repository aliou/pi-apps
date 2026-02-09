import Foundation

extension Relay {
    public struct RelaySession: Codable, Sendable, Hashable, Identifiable {
        public let id: String
        public let mode: SessionMode
        public let status: SessionStatus
        public let sandboxProvider: SandboxProviderType?
        public let sandboxProviderId: String?
        public let environmentId: String?
        public let sandboxImageDigest: String?
        public let repoId: String?
        public let repoPath: String?
        public let repoFullName: String?
        public let branchName: String?
        public let name: String?
        public let firstUserMessage: String?
        public let currentModelProvider: String?
        public let currentModelId: String?
        public let systemPrompt: String?
        public let createdAt: String
        public let lastActivityAt: String

        public init(
            id: String,
            mode: SessionMode,
            status: SessionStatus,
            sandboxProvider: SandboxProviderType? = nil,
            sandboxProviderId: String? = nil,
            environmentId: String? = nil,
            sandboxImageDigest: String? = nil,
            repoId: String? = nil,
            repoPath: String? = nil,
            repoFullName: String? = nil,
            branchName: String? = nil,
            name: String? = nil,
            firstUserMessage: String? = nil,
            currentModelProvider: String? = nil,
            currentModelId: String? = nil,
            systemPrompt: String? = nil,
            createdAt: String,
            lastActivityAt: String
        ) {
            self.id = id
            self.mode = mode
            self.status = status
            self.sandboxProvider = sandboxProvider
            self.sandboxProviderId = sandboxProviderId
            self.environmentId = environmentId
            self.sandboxImageDigest = sandboxImageDigest
            self.repoId = repoId
            self.repoPath = repoPath
            self.repoFullName = repoFullName
            self.branchName = branchName
            self.name = name
            self.firstUserMessage = firstUserMessage
            self.currentModelProvider = currentModelProvider
            self.currentModelId = currentModelId
            self.systemPrompt = systemPrompt
            self.createdAt = createdAt
            self.lastActivityAt = lastActivityAt
        }
    }
}
