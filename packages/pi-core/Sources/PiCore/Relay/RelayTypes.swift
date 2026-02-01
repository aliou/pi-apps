//
//  RelayTypes.swift
//  PiCore
//
//  Types for relay server REST and WebSocket APIs
//

import Foundation

// MARK: - REST Response Wrapper

/// All REST responses follow this format
public struct RelayResponse<T: Decodable & Sendable>: Decodable, Sendable {
    public let data: T?
    public let error: String?
}

// MARK: - Health

public struct HealthResponse: Decodable, Sendable {
    public let ok: Bool
    public let version: String
}

// MARK: - Sessions

public struct RelaySession: Decodable, Sendable, Identifiable, Hashable {
    public let id: String
    public let mode: SessionMode
    public let status: SessionStatus
    public let sandboxProvider: String?
    public let repoId: String?
    public let repoPath: String?
    public let branchName: String?
    public let name: String?
    public let currentModelProvider: String?
    public let currentModelId: String?
    public let systemPrompt: String?
    public let createdAt: String
    public let lastActivityAt: String

    // Present only on create response
    public let wsEndpoint: String?

    public init(
        id: String,
        mode: SessionMode,
        status: SessionStatus,
        sandboxProvider: String? = nil,
        repoId: String? = nil,
        repoPath: String? = nil,
        branchName: String? = nil,
        name: String? = nil,
        currentModelProvider: String? = nil,
        currentModelId: String? = nil,
        systemPrompt: String? = nil,
        createdAt: String,
        lastActivityAt: String,
        wsEndpoint: String? = nil
    ) {
        self.id = id
        self.mode = mode
        self.status = status
        self.sandboxProvider = sandboxProvider
        self.repoId = repoId
        self.repoPath = repoPath
        self.branchName = branchName
        self.name = name
        self.currentModelProvider = currentModelProvider
        self.currentModelId = currentModelId
        self.systemPrompt = systemPrompt
        self.createdAt = createdAt
        self.lastActivityAt = lastActivityAt
        self.wsEndpoint = wsEndpoint
    }

    /// Parse lastActivityAt into a Date
    public var lastActivityDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: lastActivityAt) {
            return date
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: lastActivityAt)
    }

    /// Display name with fallback to truncated session ID
    public var displayName: String {
        name ?? String(id.prefix(8)) + "..."
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id
    }
}

public enum SessionStatus: String, Codable, Sendable {
    case creating
    case ready
    case running
    case stopped
    case error
    case deleted
}

public struct CreateSessionParams: Encodable, Sendable {
    public let mode: SessionMode
    public let repoId: String?
    public let modelProvider: String?
    public let modelId: String?
    public let systemPrompt: String?
    public let sandboxProvider: String?

    public init(
        mode: SessionMode,
        repoId: String? = nil,
        modelProvider: String? = nil,
        modelId: String? = nil,
        systemPrompt: String? = nil,
        sandboxProvider: String? = nil
    ) {
        self.mode = mode
        self.repoId = repoId
        self.modelProvider = modelProvider
        self.modelId = modelId
        self.systemPrompt = systemPrompt
        self.sandboxProvider = sandboxProvider
    }
}

public struct ConnectionInfo: Decodable, Sendable {
    public let sessionId: String
    public let status: SessionStatus
    public let lastSeq: Int
    public let sandboxReady: Bool
    public let wsEndpoint: String
}

public struct EventsResponse: Decodable, Sendable {
    public let events: [JournaledEvent]
    public let lastSeq: Int
}

public struct JournaledEvent: Decodable, Sendable {
    public let seq: Int
    public let type: String
    public let payload: AnyCodable
    public let createdAt: String
}

// MARK: - GitHub

public struct GitHubTokenStatus: Decodable, Sendable {
    public let configured: Bool
    public let valid: Bool?
    public let user: String?
    public let scopes: [String]?
    public let rateLimitRemaining: Int?
    public let error: String?
}

public struct GitHubTokenInfo: Decodable, Sendable {
    public let user: String
    public let scopes: [String]
}

public struct RepoInfo: Decodable, Sendable, Identifiable, Hashable {
    public let id: Int
    public let name: String
    public let fullName: String
    public let `private`: Bool
    public let description: String?
    public let htmlUrl: String?
    public let cloneUrl: String?
    public let sshUrl: String?
    public let defaultBranch: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case fullName = "full_name"
        case `private`
        case description
        case htmlUrl = "html_url"
        case cloneUrl = "clone_url"
        case sshUrl = "ssh_url"
        case defaultBranch = "default_branch"
    }

    public init(
        id: Int,
        name: String,
        fullName: String,
        `private`: Bool,
        description: String? = nil,
        htmlUrl: String? = nil,
        cloneUrl: String? = nil,
        sshUrl: String? = nil,
        defaultBranch: String? = nil
    ) {
        self.id = id
        self.name = name
        self.fullName = fullName
        self.`private` = `private`
        self.description = description
        self.htmlUrl = htmlUrl
        self.cloneUrl = cloneUrl
        self.sshUrl = sshUrl
        self.defaultBranch = defaultBranch
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Secrets

public enum SecretId: String, Codable, Sendable, CaseIterable {
    case anthropicApiKey = "anthropic_api_key"
    case openaiApiKey = "openai_api_key"
    case geminiApiKey = "gemini_api_key"
    case groqApiKey = "groq_api_key"
    case deepseekApiKey = "deepseek_api_key"
    case openrouterApiKey = "openrouter_api_key"
    case githubToken = "github_token"
}

public struct SecretMetadata: Decodable, Sendable {
    public let id: String
    public let name: String
    public let createdAt: String
    public let updatedAt: String
}

public struct SecretStatus: Decodable, Sendable {
    public let id: String
    public let configured: Bool
}

public struct SecretSchemaItem: Decodable, Sendable {
    public let id: String
    public let envVar: String
    public let name: String
}

// MARK: - WebSocket Events (Relay-specific)

public enum SandboxStatus: String, Codable, Sendable {
    case creating
    case running
    case paused
    case stopping
    case stopped
    case error
}

/// Events specific to the relay server (not from Pi)
public enum RelayServerEvent: Sendable {
    case connected(sessionId: String, lastSeq: Int)
    case replayStart(fromSeq: Int, toSeq: Int)
    case replayEnd
    case sandboxStatus(status: SandboxStatus, message: String?)
    case error(code: String, message: String)
}

/// Combined event type for relay WebSocket
public enum RelayEvent: Sendable {
    case relay(RelayServerEvent)
    case pi(RPCEvent)
}

// MARK: - Internal Types for REST Responses

struct DeleteResult: Decodable, Sendable {
    let ok: Bool
}

struct OkResult: Decodable, Sendable {
    let ok: Bool
}
