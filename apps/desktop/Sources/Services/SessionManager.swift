//
//  SessionManager.swift
//  pi
//
//  Manages multiple desktop sessions with their connections
//

import Foundation
import PiCore
import PiUI

/// Manages multiple desktop sessions with their connections
@MainActor
@Observable
final class SessionManager {
    private(set) var sessions: [DesktopSession] = []
    private(set) var activeSessionId: UUID?

    /// Running local connections keyed by session ID
    /// These persist even when switching to another session
    private var localConnections: [UUID: LocalConnection] = [:]

    /// Session engines keyed by session ID
    private var engines: [UUID: SessionEngine] = [:]

    /// Event subscription tasks keyed by session ID
    private var eventTasks: [UUID: Task<Void, Never>] = [:]

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var indexPath: String {
        AppPaths.sessionsPath + "/desktop-sessions.json"
    }

    // MARK: - Computed Properties

    var activeSession: DesktopSession? {
        guard let id = activeSessionId else { return nil }
        return sessions.first { $0.id == id }
    }

    var activeEngine: SessionEngine? {
        guard let id = activeSessionId else { return nil }
        return engines[id]
    }

    var activeConnection: LocalConnection? {
        guard let id = activeSessionId else { return nil }
        return localConnections[id]
    }

    var chatSessions: [DesktopSession] {
        sessions.filter { $0.mode == .chat }
    }

    var codeSessions: [DesktopSession] {
        sessions.filter { $0.mode == .code }
    }

    // MARK: - Initialization

    init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        loadSessions()
    }

    // MARK: - Session Lifecycle

    /// Create a local chat session
    func createLocalChatSession() async throws -> DesktopSession {
        let session = DesktopSession.localChat()

        sessions.insert(session, at: 0)
        saveSessions()

        return session
    }

    /// Create a local code session with folder selection
    func createLocalCodeSession(selectedPath: String) async throws -> DesktopSession {
        // Find the Git repo root
        guard let repoRoot = GitService.findRepoRoot(for: selectedPath) else {
            throw SessionManagerError.notAGitRepository
        }

        // Calculate relative path from repo root to selected path
        let relativePath: String
        if selectedPath == repoRoot {
            relativePath = ""
        } else {
            var rel = selectedPath
            if rel.hasPrefix(repoRoot) {
                rel = String(rel.dropFirst(repoRoot.count))
            }
            if rel.hasPrefix("/") {
                rel = String(rel.dropFirst())
            }
            relativePath = rel
        }

        // Generate worktree name and path
        let worktreeName = GitService.generateWorktreeName()
        let worktreePath = AppPaths.worktreesPath + "/\(worktreeName)"

        // Create the worktree
        _ = try GitService.createWorktree(from: repoRoot, to: worktreePath)

        // Compute working directory within worktree
        let workingDirectory: String
        if relativePath.isEmpty {
            workingDirectory = worktreePath
        } else {
            workingDirectory = worktreePath + "/\(relativePath)"
        }

        let session = DesktopSession.localCode(
            workingDirectory: workingDirectory,
            repoRoot: repoRoot,
            relativePath: relativePath,
            worktreeName: worktreeName
        )

        sessions.insert(session, at: 0)
        saveSessions()

        return session
    }

    /// Select a session (doesn't kill other running processes)
    func selectSession(_ id: UUID) async {
        guard sessions.contains(where: { $0.id == id }) else { return }
        activeSessionId = id

        // Ensure connection is established for this session
        if let session = activeSession {
            await ensureConnection(for: session)
        }
    }

    /// Delete a session
    func deleteSession(_ id: UUID, deleteWorktree: Bool = false) async {
        guard let session = sessions.first(where: { $0.id == id }) else { return }

        // Cancel event task
        eventTasks[id]?.cancel()
        eventTasks.removeValue(forKey: id)

        // Clean up connection if exists
        if let conn = localConnections[id] {
            await conn.disconnect()
            localConnections.removeValue(forKey: id)
        }

        // Clean up engine
        engines.removeValue(forKey: id)

        // Delete worktree if requested (local code sessions)
        if deleteWorktree,
           let worktreeName = session.worktreeName,
           let repoRoot = session.repoRoot {
            let worktreePath = AppPaths.worktreesPath + "/\(worktreeName)"
            try? GitService.removeWorktree(at: worktreePath, from: repoRoot)
        }

        // Remove from list
        sessions.removeAll { $0.id == id }

        // Clear active if deleted
        if activeSessionId == id {
            activeSessionId = nil
        }

        saveSessions()
    }

    /// Update session title
    func updateTitle(for sessionId: UUID, title: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }

        sessions[index].title = title
        sessions[index].updatedAt = Date()
        sortSessions()
        saveSessions()
    }

    /// Update pi session file path (local sessions)
    func updatePiSessionFile(for sessionId: UUID, piSessionFile: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }

        sessions[index].piSessionFile = piSessionFile
        saveSessions()
    }

    /// Touch session to update timestamp
    func touchSession(_ sessionId: UUID) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }

        sessions[index].updatedAt = Date()
        sortSessions()
        saveSessions()
    }

    // MARK: - Connection Management

    private func ensureConnection(for session: DesktopSession) async {
        guard session.connectionType == .local else {
            // Remote connections not yet implemented
            return
        }

        // Check if connection already exists and is connected
        if let existingConn = localConnections[session.id], existingConn.isConnected {
            return
        }

        // Create working directory - use session's or fall back to agent path for chat
        let workDir = session.workingDirectory ?? AppPaths.agentPath
        let conn = LocalConnection(workingDirectory: workDir)
        localConnections[session.id] = conn

        do {
            try await conn.connect()
            setupEngine(for: session, connection: conn)

            // If session has existing pi session file, switch to it
            if let piSessionFile = session.piSessionFile {
                _ = try? await conn.switchSession(sessionPath: piSessionFile)
            } else {
                // Get state to capture session file
                let state = try await conn.getState()
                if let sessionFile = state.sessionFile {
                    updatePiSessionFile(for: session.id, piSessionFile: sessionFile)
                }
            }
        } catch {
            // Connection failed - engine won't be set up
            print("Connection failed: \(error.localizedDescription)")
        }
    }

    private func setupEngine(for session: DesktopSession, connection: LocalConnection) {
        let engine = SessionEngine()
        engine.configure(callbacks: SessionEngineCallbacks(
            sendPrompt: { [weak connection] text, behavior in
                guard let connection else { return }
                try await connection.prompt(text, streamingBehavior: behavior)
            },
            abort: { [weak connection] in
                guard let connection else { return }
                try await connection.abort()
            }
        ))
        engines[session.id] = engine

        // Cancel existing event task
        eventTasks[session.id]?.cancel()

        // Start event subscription
        let eventStream = connection.subscribe()
        eventTasks[session.id] = Task { [weak self, weak engine] in
            for await event in eventStream {
                guard let self, let engine, !Task.isCancelled else { break }
                await self.handleEvent(event, engine: engine, sessionId: session.id)
            }
        }
    }

    private func handleEvent(_ event: RPCEvent, engine: SessionEngine, sessionId: UUID) async {
        switch event {
        case .agentStart:
            engine.handleAgentStart()

        case .turnStart:
            engine.handleTurnStart()

        case .agentEnd(let success, let error):
            engine.handleAgentEnd(success: success, errorMessage: error?.message)

        case .messageEnd:
            engine.handleMessageEnd()

        case .messageUpdate(_, let assistantEvent):
            handleAssistantEvent(assistantEvent, engine: engine)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            let argsString = formatArgs(args)
            engine.handleToolExecutionStart(toolCallId: toolCallId, toolName: toolName, argsString: argsString)

        case .toolExecutionUpdate(let toolCallId, let output):
            engine.handleToolExecutionUpdate(toolCallId: toolCallId, output: output)

        case .toolExecutionEnd(let toolCallId, let output, let status):
            engine.handleToolExecutionEnd(toolCallId: toolCallId, output: output, success: status == .success)

        case .stateUpdate:
            // Capture session file if available
            if let conn = localConnections[sessionId] {
                Task {
                    if let state = try? await conn.getState(),
                       let sessionFile = state.sessionFile {
                        updatePiSessionFile(for: sessionId, piSessionFile: sessionFile)
                    }
                }
            }

        default:
            break
        }
    }

    private func handleAssistantEvent(_ event: AssistantMessageEvent, engine: SessionEngine) {
        switch event {
        case .textDelta(let delta):
            engine.handleTextDelta(delta)

        case .toolUseStart(let toolCallId, let toolName):
            engine.handleToolUseStart(toolCallId: toolCallId, toolName: toolName)

        case .toolUseInputDelta(let toolCallId, let delta):
            engine.handleToolUseInputDelta(toolCallId: toolCallId, delta: delta)

        default:
            break
        }
    }

    private func formatArgs(_ args: AnyCodable?) -> String? {
        guard let args else { return nil }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        if let data = try? encoder.encode(args),
           let string = String(data: data, encoding: .utf8) {
            return string
        }
        return nil
    }

    // MARK: - Persistence

    private func saveSessions() {
        do {
            let data = try encoder.encode(sessions)
            try? fileManager.createDirectory(atPath: AppPaths.sessionsPath, withIntermediateDirectories: true)
            fileManager.createFile(atPath: indexPath, contents: data)
        } catch {
            print("Failed to save sessions: \(error)")
        }
    }

    private func loadSessions() {
        guard fileManager.fileExists(atPath: indexPath),
              let data = fileManager.contents(atPath: indexPath) else {
            sessions = []
            return
        }

        do {
            sessions = try decoder.decode([DesktopSession].self, from: data)
            sortSessions()
        } catch {
            print("Failed to load sessions: \(error)")
            sessions = []
        }
    }

    private func sortSessions() {
        sessions.sort { $0.updatedAt > $1.updatedAt }
    }
}

// MARK: - Errors

enum SessionManagerError: Error, LocalizedError {
    case notConnectedToServer
    case sessionNotFound
    case invalidConfiguration
    case notAGitRepository

    var errorDescription: String? {
        switch self {
        case .notConnectedToServer:
            return "Not connected to server"
        case .sessionNotFound:
            return "Session not found"
        case .invalidConfiguration:
            return "Invalid session configuration"
        case .notAGitRepository:
            return "Selected folder is not in a Git repository"
        }
    }
}
