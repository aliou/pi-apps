//
//  SessionManager.swift
//  pi
//
//  Manages multiple desktop sessions with their connections
//

import Foundation
import PiCore
import PiUI

/// Connection state for a session
enum SessionConnectionState: Sendable, Equatable {
    case idle
    case connecting
    case connected
    case failed(String)
}

/// Manages multiple desktop sessions with their connections
@MainActor
@Observable
final class SessionManager {
    private(set) var sessions: [DesktopSession] = []
    private(set) var activeSessionId: UUID?

    /// Debug store for logging RPC events
    weak var debugStore: DebugEventStore?

    /// Per-session connection state
    private var connectionStates: [UUID: SessionConnectionState] = [:]

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

    var activeConnectionState: SessionConnectionState {
        guard let id = activeSessionId else { return .idle }
        return connectionStates[id] ?? .idle
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

        // Clean up engine and connection state
        engines.removeValue(forKey: id)
        connectionStates.removeValue(forKey: id)

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

        print("[SessionManager] ensureConnection for session \(session.id), mode: \(session.mode)")

        // Check if connection already exists and is connected
        if let existingConn = localConnections[session.id], existingConn.isConnected {
            print("[SessionManager] Reusing existing connection")
            connectionStates[session.id] = .connected

            // If engine has no messages but session has history, reload it
            if let engine = engines[session.id], engine.messages.isEmpty, session.piSessionFile != nil {
                print("[SessionManager] Engine empty, reloading history...")
                await loadMessageHistory(from: existingConn, into: engine)
            }
            return
        }

        // Set connecting state immediately
        connectionStates[session.id] = .connecting

        // Create engine BEFORE connection so UI can render
        if engines[session.id] == nil {
            let engine = SessionEngine()
            engines[session.id] = engine
        }

        // Create working directory - use session's or fall back to agent path for chat
        let workDir = session.workingDirectory ?? AppPaths.agentPath
        print("[SessionManager] Work dir: \(workDir)")

        let conn = LocalConnection(workingDirectory: workDir)
        localConnections[session.id] = conn

        do {
            try await conn.connect()

            // Configure engine with connection callbacks
            if let engine = engines[session.id] {
                configureEngine(engine, connection: conn, sessionId: session.id)
            }

            // Handle pi session file (Phase 3: Session Isolation)
            if let piSessionFile = session.piSessionFile {
                // Switch to existing pi session
                print("[SessionManager] Switching to existing pi session: \(piSessionFile)")
                do {
                    _ = try await conn.switchSession(sessionPath: piSessionFile)
                } catch {
                    print("[SessionManager] switchSession failed: \(error)")
                }

                // Load message history
                if let engine = engines[session.id] {
                    await loadMessageHistory(from: conn, into: engine)
                }
            } else {
                // Create NEW pi session for this DesktopSession
                print("[SessionManager] Creating new pi session...")
                do {
                    _ = try await conn.newSession()
                    // Get state to capture the new session file
                    let state = try await conn.getState()
                    if let sessionFile = state.sessionFile {
                        print("[SessionManager] Captured new session file: \(sessionFile)")
                        updatePiSessionFile(for: session.id, piSessionFile: sessionFile)
                    }
                } catch {
                    print("[SessionManager] Failed to create new session: \(error)")
                    // Fall back to capturing current state
                    let state = try await conn.getState()
                    if let sessionFile = state.sessionFile {
                        print("[SessionManager] Captured fallback session file: \(sessionFile)")
                        updatePiSessionFile(for: session.id, piSessionFile: sessionFile)
                    }
                }
            }

            // Connection succeeded
            connectionStates[session.id] = .connected
            print("[SessionManager] Connection established")

        } catch {
            // Connection failed
            let errorMessage = error.localizedDescription
            connectionStates[session.id] = .failed(errorMessage)
            print("[SessionManager] Connection failed: \(errorMessage)")
        }
    }

    private func configureEngine(_ engine: SessionEngine, connection: LocalConnection, sessionId: UUID) {
        engine.configure(callbacks: SessionEngineCallbacks(
            sendPrompt: { [weak self, weak connection] text, behavior in
                // Log prompt send to debug store
                await MainActor.run {
                    self?.debugStore?.addSent(command: "prompt", details: "text: \(text.prefix(100))")
                }

                guard let connection else { return }
                try await connection.prompt(text, streamingBehavior: behavior)
            },
            abort: { [weak self, weak connection] in
                // Log abort to debug store
                await MainActor.run {
                    self?.debugStore?.addSent(command: "abort")
                }

                guard let connection else { return }
                try await connection.abort()
            }
        ))

        // Cancel existing event task
        eventTasks[sessionId]?.cancel()

        // Start event subscription
        let eventStream = connection.subscribe()
        eventTasks[sessionId] = Task { [weak self, weak engine] in
            for await event in eventStream {
                guard let self, let engine, !Task.isCancelled else { break }
                await self.handleEvent(event, engine: engine, sessionId: sessionId)
            }
        }
    }

    private func loadMessageHistory(from connection: LocalConnection, into engine: SessionEngine) async {
        // First try to load via RPC
        do {
            let response = try await connection.getMessages()
            let items = response.messages.toConversationItems()
            engine.setMessages(items)
            debugStore?.addReceived(type: "history", summary: "Loaded \(items.count) items via RPC")
        } catch {
            print("[SessionManager] Failed to load message history via RPC: \(error)")
            // Fallback to file-based loading
            await loadHistoryFromFile(into: engine, for: activeSession)
        }
    }

    private func loadHistoryFromFile(into engine: SessionEngine, for session: DesktopSession?) async {
        guard let session,
              let piSessionFile = session.piSessionFile else {
            return
        }

        let items = SessionFileParser.parse(fileAt: piSessionFile)
        if !items.isEmpty {
            engine.setMessages(items)
            debugStore?.addReceived(type: "history", summary: "Loaded \(items.count) items from file")
        }
    }

    private func handleEvent(_ event: RPCEvent, engine: SessionEngine, sessionId: UUID) async {
        // Log to debug store
        debugStore?.addReceived(type: event.typeName, summary: event.summary)

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

// MARK: - RPCEvent Helpers

extension RPCEvent {
    var typeName: String {
        switch self {
        case .agentStart:
            return "agent_start"
        case .agentEnd:
            return "agent_end"
        case .turnStart:
            return "turn_start"
        case .turnEnd:
            return "turn_end"
        case .messageStart:
            return "message_start"
        case .messageEnd:
            return "message_end"
        case .messageUpdate:
            return "message_update"
        case .toolExecutionStart:
            return "tool_execution_start"
        case .toolExecutionUpdate:
            return "tool_execution_update"
        case .toolExecutionEnd:
            return "tool_execution_end"
        case .autoCompactionStart:
            return "auto_compaction_start"
        case .autoCompactionEnd:
            return "auto_compaction_end"
        case .autoRetryStart:
            return "auto_retry_start"
        case .autoRetryEnd:
            return "auto_retry_end"
        case .hookError:
            return "hook_error"
        case .stateUpdate:
            return "state_update"
        case .modelChanged:
            return "model_changed"
        case .nativeToolRequest:
            return "native_tool_request"
        case .nativeToolCancel:
            return "native_tool_cancel"
        case .unknown(let type, _):
            return type
        }
    }

    var summary: String {
        switch self {
        case .agentStart:
            return ""
        case .agentEnd(let success, let error):
            return success ? "success" : (error?.message ?? "failed")
        case .turnStart:
            return ""
        case .turnEnd:
            return ""
        case .messageStart:
            return ""
        case .messageEnd:
            return ""
        case .messageUpdate(_, let event):
            switch event {
            case .textDelta(let delta):
                return "text_delta: \(String(delta.prefix(20)))"
            case .thinkingDelta(let delta):
                return "thinking_delta: \(String(delta.prefix(20)))"
            case .toolUseStart(_, let name):
                return "tool_use_start: \(name)"
            case .toolUseInputDelta(let id, _):
                return "tool_use_input_delta"
            case .toolUseEnd(let id):
                return "tool_use_end"
            case .messageStart(let id):
                return "message_start: \(id)"
            case .messageEnd(let reason):
                return "message_end: \(reason ?? "none")"
            case .contentBlockStart(let index, let type):
                return "content_block_start: \(index) \(type)"
            case .contentBlockEnd(let index):
                return "content_block_end: \(index)"
            case .unknown(let type):
                return type
            }
        case .toolExecutionStart(_, let name, _):
            return "\(name)"
        case .toolExecutionUpdate(let id, let output):
            return "\(id): \(String(output.prefix(20)))"
        case .toolExecutionEnd(let id, _, let status):
            return "\(id): \(status.rawValue)"
        case .autoCompactionStart:
            return ""
        case .autoCompactionEnd:
            return ""
        case .autoRetryStart(_, let attempt, _, _):
            return "attempt \(attempt)"
        case .autoRetryEnd(let success, _, _):
            return success ? "success" : "failed"
        case .hookError(_, let event, let error):
            return "\(event ?? "?"): \(error)"
        case .stateUpdate:
            return ""
        case .modelChanged(let model):
            return model.name
        case .nativeToolRequest:
            return "tool request"
        case .nativeToolCancel(let id):
            return id
        case .unknown(let type, _):
            return type
        }
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
