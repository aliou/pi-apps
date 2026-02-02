//
//  DesktopSession.swift
//  pi
//
//  Unified session model supporting both local and remote connections
//

import Foundation
import PiCore

/// Connection type for a session
enum ConnectionType: String, Codable, Sendable {
    case local   // Subprocess
    case remote  // WebSocket server
}

/// A desktop session (local or remote)
struct DesktopSession: Identifiable, Codable, Sendable, Equatable {
    let id: UUID
    let mode: SessionMode
    let connectionType: ConnectionType
    let createdAt: Date
    var updatedAt: Date
    var title: String

    // Local-specific (code mode only for local)
    var workingDirectory: String?
    var piSessionFile: String?
    var repoRoot: String?
    var worktreeName: String?
    var relativePath: String?

    // Remote-specific
    var serverSessionId: String?
    var repoId: String?
    var repoName: String?
    var environmentId: String?
    var environmentName: String?
    var serverURL: String?

    /// Display name for the session
    var displayTitle: String {
        if !title.isEmpty && title != "New Session" && title != "New Chat" {
            return title
        }
        if let repoName {
            return repoName
        }
        if let workingDirectory {
            return URL(fileURLWithPath: workingDirectory).lastPathComponent
        }
        return mode == .chat ? "New Chat" : "New Code Session"
    }

    /// Whether this session has an active working context
    var hasContext: Bool {
        switch connectionType {
        case .local:
            return workingDirectory != nil
        case .remote:
            return repoId != nil
        }
    }

    /// Full path to the worktree (local sessions only)
    var worktreePath: String? {
        guard let worktreeName else { return nil }
        return AppPaths.worktreesPath + "/\(worktreeName)"
    }

    /// Project name derived from repo root
    var projectName: String? {
        guard let repoRoot else { return nil }
        return URL(fileURLWithPath: repoRoot).lastPathComponent
    }

    // MARK: - Initializers

    /// Create a local chat session
    static func localChat() -> Self {
        Self(
            id: UUID(),
            mode: .chat,
            connectionType: .local,
            createdAt: Date(),
            updatedAt: Date(),
            title: "New Chat"
        )
    }

    /// Create a local code session
    static func localCode(
        workingDirectory: String,
        repoRoot: String,
        relativePath: String,
        worktreeName: String
    ) -> Self {
        Self(
            id: UUID(),
            mode: .code,
            connectionType: .local,
            createdAt: Date(),
            updatedAt: Date(),
            title: "New Session",
            workingDirectory: workingDirectory,
            repoRoot: repoRoot,
            worktreeName: worktreeName,
            relativePath: relativePath
        )
    }

    /// Create a remote session (chat or code)
    static func remote(
        mode: SessionMode,
        serverSessionId: String,
        serverURL: String,
        repoId: String? = nil,
        repoName: String? = nil,
        environmentId: String? = nil,
        environmentName: String? = nil
    ) -> Self {
        Self(
            id: UUID(),
            mode: mode,
            connectionType: .remote,
            createdAt: Date(),
            updatedAt: Date(),
            title: mode == .chat ? "New Chat" : "New Session",
            serverSessionId: serverSessionId,
            repoId: repoId,
            repoName: repoName,
            environmentId: environmentId,
            environmentName: environmentName,
            serverURL: serverURL
        )
    }
}
