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

    /// Whether the active session needs auth setup (missing API keys)
    private(set) var needsAuthSetup = false

    /// Debug store for logging RPC events
    weak var debugStore: DebugEventStore?

    /// Per-session connection state
    private var connectionStates: [UUID: SessionConnectionState] = [:]

    /// Running local connections keyed by session ID
    /// These persist even when switching to another session
    private var localConnections: [UUID: LocalConnection] = [:]

    /// Running remote connections keyed by session ID
    private var remoteConnections: [UUID: ServerConnection] = [:]

    /// Session engines keyed by session ID
    private var engines: [UUID: SessionEngine] = [:]

    /// Event subscription tasks keyed by session ID
    private var eventTasks: [UUID: Task<Void, Never>] = [:]

    /// Sessions that have had their titles updated (to avoid overwriting)
    private var titledSessions: Set<UUID> = []

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

    /// Create a remote chat session
    func createRemoteChatSession(serverURL: URL) async throws -> DesktopSession {
        let session = DesktopSession.remote(
            mode: .chat,
            serverSessionId: "", // Will be set during connection
            serverURL: serverURL.absoluteString
        )

        sessions.insert(session, at: 0)
        saveSessions()

        return session
    }

    /// Create a remote code session
    func createRemoteCodeSession(serverURL: URL, repoId: String, repoName: String) async throws -> DesktopSession {
        let session = DesktopSession.remote(
            mode: .code,
            serverSessionId: "", // Will be set during connection
            serverURL: serverURL.absoluteString,
            repoId: repoId,
            repoName: repoName
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

        // Clean up local connection if exists
        if let conn = localConnections[id] {
            await conn.disconnect()
            localConnections.removeValue(forKey: id)
        }

        // Clean up remote connection if exists
        if let conn = remoteConnections[id] {
            await conn.disconnectFromSession()
            remoteConnections.removeValue(forKey: id)
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

    /// Send initial prompt and update title
    func sendInitialPrompt(for sessionId: UUID, prompt: String) async {
        guard let engine = engines[sessionId] else { return }

        // Update title from first prompt (if not already titled)
        if !titledSessions.contains(sessionId) {
            let title = deriveTitle(from: prompt)
            updateTitle(for: sessionId, title: title)
            titledSessions.insert(sessionId)
        }

        // Send the prompt
        await engine.send(prompt)
    }

    /// Send message and optionally update title (for chat sessions)
    func sendMessage(for sessionId: UUID, text: String) async {
        guard let engine = engines[sessionId] else { return }

        // Update title from first message if still default
        if !titledSessions.contains(sessionId) {
            if let session = sessions.first(where: { $0.id == sessionId }),
               session.title == nil || session.title == "New Chat" || session.title == "New Session" {
                let title = deriveTitle(from: text)
                updateTitle(for: sessionId, title: title)
            }
            titledSessions.insert(sessionId)
        }

        touchSession(sessionId)
        await engine.send(text)
    }

    /// Derive a title from a prompt (first line, max 50 chars)
    private func deriveTitle(from prompt: String) -> String {
        let firstLine = prompt.components(separatedBy: .newlines).first ?? prompt
        let trimmed = firstLine.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "New Session"
        }
        if trimmed.count <= 50 {
            return trimmed
        }
        return String(trimmed.prefix(47)) + "..."
    }

    // MARK: - Connection Management

    private func ensureConnection(for session: DesktopSession) async {
        switch session.connectionType {
        case .local:
            await ensureLocalConnection(for: session)
        case .remote:
            await ensureRemoteConnection(for: session)
        }
    }

    private func ensureLocalConnection(for session: DesktopSession) async {
        print("[SessionManager] ensureLocalConnection for session \(session.id), mode: \(session.mode)")

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
            needsAuthSetup = false
            print("[SessionManager] Connection established")

        } catch {
            // Connection failed - check if it's an auth error
            let errorMessage = error.localizedDescription
            if isAuthError(error) {
                needsAuthSetup = true
                connectionStates[session.id] = .failed("No API keys configured")
                print("[SessionManager] Connection failed: missing API keys")
            } else {
                needsAuthSetup = false
                connectionStates[session.id] = .failed(errorMessage)
                print("[SessionManager] Connection failed: \(errorMessage)")
            }
        }
    }

    private func ensureRemoteConnection(for session: DesktopSession) async {
        print("[SessionManager] ensureRemoteConnection for session \(session.id), mode: \(session.mode)")

        guard let serverURLString = session.serverURL,
              let serverURL = URL(string: serverURLString) else {
            connectionStates[session.id] = .failed("No server URL")
            return
        }

        // Check if connection already exists and is connected
        if let existingConn = remoteConnections[session.id], existingConn.isSessionConnected {
            print("[SessionManager] Reusing existing remote connection")
            connectionStates[session.id] = .connected

            // If engine has no messages but session has server ID, reload history
            if let engine = engines[session.id], engine.messages.isEmpty, session.serverSessionId != nil {
                print("[SessionManager] Engine empty, reloading remote history...")
                await loadRemoteMessageHistory(from: existingConn, into: engine)
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

        let conn = ServerConnection(serverURL: serverURL)
        remoteConnections[session.id] = conn

        do {
            // Check server health first
            try await conn.checkHealth()

            // Attach or create session on server
            if let serverSessionId = session.serverSessionId, !serverSessionId.isEmpty {
                // Attach to existing server session
                print("[SessionManager] Connecting to server session: \(serverSessionId)")
                let relaySession = try await conn.api.getSession(id: serverSessionId)
                try await conn.connectToSession(relaySession)
            } else {
                // Create new session on server
                print("[SessionManager] Creating new server session...")
                let relaySession: RelaySession
                if session.mode == .chat {
                    relaySession = try await conn.createSession(mode: .chat)
                } else if let repoId = session.repoId {
                    relaySession = try await conn.createSession(mode: .code, repoId: repoId)
                } else {
                    throw SessionManagerError.invalidConfiguration
                }

                // Update local session with server ID
                updateServerSessionId(for: session.id, serverSessionId: relaySession.id)

                // Connect to the newly created session
                try await conn.connectToSession(relaySession)
            }

            // Configure engine with remote connection callbacks
            if let engine = engines[session.id] {
                configureRemoteEngine(engine, connection: conn, sessionId: session.id)
            }

            // Load message history
            if let engine = engines[session.id] {
                await loadRemoteMessageHistory(from: conn, into: engine)
            }

            connectionStates[session.id] = .connected
            print("[SessionManager] Remote connection established")

        } catch {
            connectionStates[session.id] = .failed(error.localizedDescription)
            print("[SessionManager] Remote connection failed: \(error)")
        }
    }

    private func configureRemoteEngine(_ engine: SessionEngine, connection: ServerConnection, sessionId: UUID) {
        engine.configure(callbacks: SessionEngineCallbacks(
            sendPrompt: { [weak self, weak connection] text, behavior in
                await MainActor.run {
                    self?.debugStore?.addSent(command: "prompt", details: "text: \(text.prefix(100))")
                }

                guard let connection else { return }
                try await connection.prompt(text, streamingBehavior: behavior)
            },
            abort: { [weak self, weak connection] in
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

    private func loadRemoteMessageHistory(from connection: ServerConnection, into engine: SessionEngine) async {
        do {
            let response = try await connection.getMessages()
            let items = response.messages.toConversationItems()
            engine.setMessages(items)
            debugStore?.addReceived(type: "history", summary: "Loaded \(items.count) items from remote")
        } catch {
            print("[SessionManager] Failed to load remote message history: \(error)")
        }
    }

    private func updateServerSessionId(for sessionId: UUID, serverSessionId: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        sessions[index].serverSessionId = serverSessionId
        saveSessions()
    }

    /// Check if an error indicates missing API keys
    private func isAuthError(_ error: Error) -> Bool {
        let message = error.localizedDescription.lowercased()
        return message.contains("no models") ||
               message.contains("no api key") ||
               message.contains("authentication") ||
               message.contains("api_key") ||
               message.contains("unauthorized")
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

    /// Reset all in-memory state (called after app data is cleared)
    func reset() {
        // Cancel all event tasks
        for task in eventTasks.values {
            task.cancel()
        }
        eventTasks.removeAll()

        // Disconnect all local connections (fire and forget)
        let localConns = localConnections.values
        Task {
            for connection in localConns {
                await connection.disconnect()
            }
        }
        localConnections.removeAll()

        // Disconnect all remote connections (fire and forget)
        let remoteConns = remoteConnections.values
        Task {
            for connection in remoteConns {
                await connection.disconnectFromSession()
            }
        }
        remoteConnections.removeAll()

        // Clear engines
        engines.removeAll()

        // Clear state
        connectionStates.removeAll()
        titledSessions.removeAll()

        // Clear sessions
        sessions = []
        activeSessionId = nil
        needsAuthSetup = false
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
