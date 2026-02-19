import Foundation

extension Relay {
    public struct CreateSessionRequest: Codable, Sendable {
        public let mode: SessionMode
        public let repoId: String?
        public let environmentId: String?
        public let modelProvider: String?
        public let modelId: String?
        public let systemPrompt: String?
        public let nativeToolsEnabled: Bool?

        public init(
            mode: SessionMode,
            repoId: String? = nil,
            environmentId: String? = nil,
            modelProvider: String? = nil,
            modelId: String? = nil,
            systemPrompt: String? = nil,
            nativeToolsEnabled: Bool? = nil
        ) {
            self.mode = mode
            self.repoId = repoId
            self.environmentId = environmentId
            self.modelProvider = modelProvider
            self.modelId = modelId
            self.systemPrompt = systemPrompt
            self.nativeToolsEnabled = nativeToolsEnabled
        }
    }

    public struct CreateSessionResponse: Codable, Sendable, Hashable {
        public let id: String
        public let mode: SessionMode
        public let status: SessionStatus
        public let wsEndpoint: String
        public let sandboxProvider: SandboxProviderType?
        public let sandboxProviderId: String?
        public let environmentId: String?
        public let repoId: String?
        public let branchName: String?
        public let currentModelProvider: String?
        public let currentModelId: String?
        public let systemPrompt: String?
        public let createdAt: String
        public let lastActivityAt: String

        public init(
            id: String,
            mode: SessionMode,
            status: SessionStatus,
            wsEndpoint: String,
            sandboxProvider: SandboxProviderType? = nil,
            sandboxProviderId: String? = nil,
            environmentId: String? = nil,
            repoId: String? = nil,
            branchName: String? = nil,
            currentModelProvider: String? = nil,
            currentModelId: String? = nil,
            systemPrompt: String? = nil,
            createdAt: String,
            lastActivityAt: String
        ) {
            self.id = id
            self.mode = mode
            self.status = status
            self.wsEndpoint = wsEndpoint
            self.sandboxProvider = sandboxProvider
            self.sandboxProviderId = sandboxProviderId
            self.environmentId = environmentId
            self.repoId = repoId
            self.branchName = branchName
            self.currentModelProvider = currentModelProvider
            self.currentModelId = currentModelId
            self.systemPrompt = systemPrompt
            self.createdAt = createdAt
            self.lastActivityAt = lastActivityAt
        }
    }

    public struct ActivateSessionResponse: Codable, Sendable, Hashable {
        public let sessionId: String
        public let status: String
        public let lastSeq: Int
        public let sandboxStatus: SandboxStatus
        public let wsEndpoint: String

        public init(
            sessionId: String,
            status: String,
            lastSeq: Int,
            sandboxStatus: SandboxStatus,
            wsEndpoint: String
        ) {
            self.sessionId = sessionId
            self.status = status
            self.lastSeq = lastSeq
            self.sandboxStatus = sandboxStatus
            self.wsEndpoint = wsEndpoint
        }
    }

    public struct SessionEventsResponse: Codable, Sendable {
        public let events: [SessionEvent]
        public let lastSeq: Int

        public init(events: [SessionEvent], lastSeq: Int) {
            self.events = events
            self.lastSeq = lastSeq
        }
    }

    public struct SessionEvent: Codable, Sendable, Hashable {
        public let seq: Int
        public let type: String
        public let payload: AnyCodable
        public let createdAt: String

        public init(
            seq: Int,
            type: String,
            payload: AnyCodable,
            createdAt: String
        ) {
            self.seq = seq
            self.type = type
            self.payload = payload
            self.createdAt = createdAt
        }
    }

    public struct SessionHistoryResponse: Codable, Sendable {
        public let entries: [SessionEntry]

        public init(entries: [SessionEntry]) {
            self.entries = entries
        }
    }

    // SessionEntry is a type alias for AnyCodable since each entry is a JSON object with arbitrary fields
    public typealias SessionEntry = AnyCodable

    // MARK: - Client Capabilities

    public struct ActivateSessionRequest: Codable, Sendable {
        public let clientId: String

        public init(clientId: String) {
            self.clientId = clientId
        }
    }

    public struct ClientCapabilities: Sendable {
        public let clientKind: ClientKind
        public let capabilities: CapabilityFlags

        public init(clientKind: ClientKind = .unknown, extensionUI: Bool = false) {
            self.clientKind = clientKind
            self.capabilities = CapabilityFlags(extensionUI: extensionUI)
        }
    }

    public enum ClientKind: String, Codable, Sendable {
        case web = "web"
        case iOS = "ios"
        case macOS = "macos"
        case unknown = "unknown"
    }

    public struct CapabilityFlags: Codable, Sendable {
        public let extensionUI: Bool

        public init(extensionUI: Bool) {
            self.extensionUI = extensionUI
        }
    }

    public struct SetClientCapabilitiesRequest: Codable, Sendable {
        public let clientKind: ClientKind
        public let capabilities: CapabilityFlags

        public init(clientKind: ClientKind, capabilities: CapabilityFlags) {
            self.clientKind = clientKind
            self.capabilities = capabilities
        }
    }

    public struct ClientCapabilitiesResponse: Codable, Sendable {
        public let sessionId: String
        public let clientId: String
        public let capabilities: CapabilityFlags

        public init(sessionId: String, clientId: String, capabilities: CapabilityFlags) {
            self.sessionId = sessionId
            self.clientId = clientId
            self.capabilities = capabilities
        }
    }
}
