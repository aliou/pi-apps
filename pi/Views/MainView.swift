//
//  MainView.swift
//  pi
//
//  Main application view with sidebar and content area
//

import SwiftUI
import Combine

struct MainView: View {
    @StateObject private var sessionStore = SessionStore()
    @StateObject private var appState = AppState()
    @StateObject private var debugStore = DebugEventStore()
    @ObservedObject private var titlebarState = TitlebarState.shared

    @State private var selectedSessionId: UUID?
    @State private var showNewSession = true
    @State private var sidebarWidth: CGFloat = 280
    @State private var debugPanelWidth: CGFloat = 320

    // Binary/update state
    @State private var binaryReady = false
    @State private var updateAvailable: String?
    @State private var showUpdateSheet = false
    @State private var updateDismissed = false

    var body: some View {
        Group {
            if !binaryReady {
                // Show setup view when binary is missing
                SetupView {
                    binaryReady = true
                }
            } else {
                mainContent
            }
        }
        .onAppear {
            checkBinaryAndUpdates()
        }
        .sheet(isPresented: $showUpdateSheet) {
            UpdateSheet()
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        ZStack {
            VStack(spacing: 0) {
                // Update banner (if available and not dismissed)
                if let version = updateAvailable, !updateDismissed {
                    UpdateAvailableBanner(
                        version: version,
                        onUpdate: { showUpdateSheet = true },
                        onDismiss: { updateDismissed = true }
                    )
                }

                mainLayout
            }

            titlebarButtons
        }
        .background(Theme.pageBg)
        .ignoresSafeArea()
        .toolbar(.hidden)
        .onAppear {
            appState.debugStore = debugStore
        }
    }

    @ViewBuilder
    private var mainLayout: some View {
        HStack(spacing: 0) {
            // Sidebar
            if titlebarState.showSidebar {
                SidebarView(
                    sessions: sessionStore.sessions,
                    selectedSessionId: selectedSessionId,
                    onSelectSession: { session in
                        selectSession(session)
                    },
                    onDeleteSession: { session, deleteWorktree in
                        deleteSession(session, deleteWorktree: deleteWorktree)
                    },
                    onNewSession: {
                        showNewSession = true
                        selectedSessionId = nil
                        Task {
                            await appState.disconnect()
                        }
                    }
                )
                .frame(width: sidebarWidth)

                // Divider
                Rectangle()
                    .fill(Theme.borderMuted)
                    .frame(width: 1)
            }

            // Main content
            Group {
                if showNewSession {
                    NewSessionView { folderPath, prompt in
                        startNewSession(folderPath: folderPath, prompt: prompt)
                    }
                } else if let sessionId = selectedSessionId,
                          let session = sessionStore.sessions.first(where: { $0.id == sessionId }) {
                    SessionContentView(
                        session: session,
                        appState: appState,
                        sessionStore: sessionStore
                    )
                } else {
                    // Fallback - show new session view
                    NewSessionView { folderPath, prompt in
                        startNewSession(folderPath: folderPath, prompt: prompt)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Debug panel
            if titlebarState.showDebugPanel {
                Rectangle()
                    .fill(Theme.borderMuted)
                    .frame(width: 1)

                DebugPanelView(store: debugStore)
                    .frame(width: debugPanelWidth)
            }
        }
    }

    @ViewBuilder
    private var titlebarButtons: some View {
        // Floating titlebar buttons - traffic lights are ~8px from top, 12px diameter
        HStack {
            // Sidebar toggle - positioned after traffic lights
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    titlebarState.showSidebar.toggle()
                }
            } label: {
                Image(systemName: "sidebar.leading")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .hoverEffect()

            Spacer()
        }
        .padding(.leading, 78)
        .padding(.trailing, 8)
        .padding(.top, 1)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func checkBinaryAndUpdates() {
        // Check if binary exists
        binaryReady = AppPaths.piExecutableExists

        // If binary exists, check for updates on launch
        if binaryReady {
            Task {
                let result = await BinaryUpdateService.shared.checkForUpdates()
                await MainActor.run {
                    if case .updateAvailable(let version) = result {
                        updateAvailable = version
                    }
                }
            }
        }
    }

    private func selectSession(_ session: Session) {
        selectedSessionId = session.id
        showNewSession = false

        // Disconnect from current and connect to selected session
        Task {
            await appState.disconnect()
            await appState.connect(to: session, sessionStore: sessionStore)
        }
    }

    private func deleteSession(_ session: Session, deleteWorktree: Bool) {
        if selectedSessionId == session.id {
            selectedSessionId = nil
            showNewSession = true
            Task {
                await appState.disconnect()
            }
        }
        sessionStore.deleteSession(session, deleteWorktree: deleteWorktree)
    }

    private func startNewSession(folderPath: String, prompt: String) {
        do {
            let session = try sessionStore.createSession(selectedPath: folderPath)

            // Update title from prompt (first 50 chars)
            let title = String(prompt.prefix(50))
            sessionStore.updateTitle(for: session.id, title: title)

            selectedSessionId = session.id
            showNewSession = false

            // Connect and send initial prompt
            Task {
                await appState.connect(to: session, sessionStore: sessionStore)
                await appState.sendMessage(prompt)
            }
        } catch {
            // Error is shown in NewSessionView validation, shouldn't happen here
            print("Failed to create session: \(error)")
        }
    }
}

// MARK: - Session Content View

struct SessionContentView: View {
    let session: Session
    @ObservedObject var appState: AppState
    let sessionStore: SessionStore

    @State private var expandedToolCalls: Set<String> = []

    var body: some View {
        VStack(spacing: 0) {
            // Header
            sessionHeader

            Divider()
                .background(Theme.borderMuted)

            // Conversation
            ConversationView(
                items: appState.conversationItems,
                isProcessing: appState.isProcessing,
                expandedToolCalls: $expandedToolCalls,
                onSendMessage: { message in
                    sessionStore.touchSession(session.id)
                    Task {
                        await appState.sendMessage(message)
                    }
                },
                onAbort: {
                    Task {
                        await appState.abort()
                    }
                }
            )
        }
    }

    private var sessionHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.text)

                Text(projectName)
                    .font(.system(size: 12))
                    .foregroundColor(Theme.dim)
            }

            Spacer()

            // Connection status
            Circle()
                .fill(appState.isConnected ? Theme.success : Theme.error)
                .frame(width: 8, height: 8)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .padding(.top, 24) // Account for titlebar area
        .background(Color(red: 0.12, green: 0.12, blue: 0.12))
    }

    private var projectName: String {
        session.projectName
    }
}

// MARK: - App State

@MainActor
class AppState: ObservableObject {
    @Published private(set) var isConnected = false
    @Published private(set) var isProcessing = false
    @Published private(set) var conversationItems: [ConversationItem] = []
    @Published private(set) var error: String?

    var debugStore: DebugEventStore?

    private var rpcClient: RPCClient?
    private var eventTask: Task<Void, Never>?
    private var currentSession: Session?
    private var sessionStoreRef: SessionStore?

    private var toolCallOutputs: [String: String] = [:]
    private var toolCallStatuses: [String: ToolCallStatus] = [:]

    // Throttling for text updates
    private var pendingTextDelta = ""
    private var textUpdateTask: Task<Void, Never>?
    private let textUpdateInterval: UInt64 = 50_000_000 // 50ms in nanoseconds

    func connect(to session: Session, sessionStore: SessionStore? = nil) async {
        await disconnect()

        currentSession = session
        self.sessionStoreRef = sessionStore
        debugStore?.addSent(command: "connect", details: "workingDirectory: \(session.workingDirectory)")

        // Load conversation from session file first (if exists)
        if let piSessionFile = session.piSessionFile {
            let items = SessionFileParser.parse(fileAt: piSessionFile)
            conversationItems = items
            debugStore?.addReceived(type: "parsed", summary: "Loaded \(items.count) items from session file")
        }

        let client = RPCClient()
        rpcClient = client

        do {
            try await client.start(workingDirectory: session.workingDirectory)
            isConnected = true
            debugStore?.addReceived(type: "connected", summary: "pi process started")

            startEventListener()

            if let piSessionFile = session.piSessionFile {
                debugStore?.addSent(command: "switch_session", details: piSessionFile)
                let result = try await client.switchSession(sessionPath: piSessionFile)
                debugStore?.addReceived(type: "response", summary: "switch_session: cancelled=\(result.cancelled)")
            } else {
                debugStore?.addSent(command: "get_state")
                let state = try await client.getState()
                if let sessionFile = state.sessionFile {
                    debugStore?.addReceived(type: "response", summary: "get_state: sessionFile=\(sessionFile)")
                    sessionStore?.updatePiSessionFile(for: session.id, piSessionFile: sessionFile)
                    // Update our local reference
                    currentSession?.piSessionFile = sessionFile
                }
            }
        } catch {
            self.error = error.localizedDescription
            debugStore?.addError("Connection failed", details: error.localizedDescription)
            logError("Connection failed: \(error.localizedDescription)")
            isConnected = false
        }
    }

    func disconnect() async {
        // Cancel pending updates
        textUpdateTask?.cancel()
        textUpdateTask = nil

        // Flush any remaining text
        await flushTextDelta()

        eventTask?.cancel()
        eventTask = nil

        if let client = rpcClient {
            await client.stop()
        }
        rpcClient = nil

        isConnected = false
        isProcessing = false
        conversationItems = []
        toolCallOutputs = [:]
        toolCallStatuses = [:]
        pendingTextDelta = ""
        currentSession = nil
    }

    func sendMessage(_ message: String) async {
        guard let client = rpcClient, isConnected else { return }

        // Add user message immediately
        let userItem = ConversationItem.userMessage(
            id: UUID().uuidString,
            text: message
        )
        conversationItems.append(userItem)

        isProcessing = true
        debugStore?.addSent(command: "prompt", details: message)

        do {
            try await client.prompt(message)
            debugStore?.addReceived(type: "response", summary: "prompt accepted")
        } catch {
            self.error = error.localizedDescription
            debugStore?.addError("prompt failed", details: error.localizedDescription)
            logError("Prompt failed: \(error.localizedDescription)")
            isProcessing = false
        }
    }

    func abort() async {
        guard let client = rpcClient else { return }

        do {
            try await client.abort()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func startEventListener() {
        guard let client = rpcClient else { return }

        eventTask = Task {
            let events = await client.events

            for await event in events {
                await handleEvent(event)
            }
        }
    }

    private func handleEvent(_ event: RPCEvent) async {
        switch event {
        case .agentStart:
            debugStore?.addReceived(type: "agent_start", summary: "")
            isProcessing = true

        case .agentEnd(let success, let error):
            debugStore?.addReceived(type: "agent_end", summary: success ? "success" : "error: \(error?.message ?? "")")
            isProcessing = false

        case .turnStart:
            debugStore?.addReceived(type: "turn_start", summary: "")

        case .turnEnd:
            debugStore?.addReceived(type: "turn_end", summary: "")

        case .messageStart(let messageId):
            debugStore?.addReceived(type: "message_start", summary: messageId ?? "")

        case .messageEnd(let stopReason):
            debugStore?.addReceived(type: "message_end", summary: stopReason ?? "")

        case .autoCompactionStart:
            debugStore?.addReceived(type: "auto_compaction_start", summary: "")

        case .autoCompactionEnd:
            debugStore?.addReceived(type: "auto_compaction_end", summary: "")

        case .autoRetryStart(let attempt, let maxAttempts, _, let errorMessage):
            debugStore?.addReceived(type: "auto_retry_start", summary: "attempt \(attempt)/\(maxAttempts)", details: errorMessage)

        case .autoRetryEnd(let success, let attempt, let finalError):
            debugStore?.addReceived(type: "auto_retry_end", summary: success ? "success" : "failed at \(attempt)", details: finalError)

        case .hookError(let extensionPath, let event, let error):
            debugStore?.addReceived(type: "hook_error", summary: extensionPath ?? event ?? "unknown", details: error)

        case .messageUpdate(_, let assistantEvent):
            // Don't log message_update events - too frequent and noisy
            handleAssistantMessage(assistantEvent)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            let argsString = formatArgs(args)
            debugStore?.addReceived(type: "tool_execution_start", summary: toolName, details: argsString)
            toolCallStatuses[toolCallId] = .running
            toolCallOutputs[toolCallId] = ""

            let item = ConversationItem.toolCall(
                id: toolCallId,
                name: toolName,
                args: argsString,
                output: nil,
                status: .running,
                isExpanded: false
            )
            conversationItems.append(item)

        case .toolExecutionUpdate(let toolCallId, let output):
            // Don't log updates - too noisy
            // Note: partialResult contains accumulated output, not just delta
            toolCallOutputs[toolCallId] = output
            updateToolCall(id: toolCallId)

        case .toolExecutionEnd(let toolCallId, let output, let status):
            debugStore?.addReceived(type: "tool_execution_end", summary: "\(status)", details: output)
            if let output {
                toolCallOutputs[toolCallId] = output
            }
            toolCallStatuses[toolCallId] = status == .success ? .success : .error
            updateToolCall(id: toolCallId)

        case .stateUpdate(let context):
            debugStore?.addReceived(type: "state_update", summary: "model: \(context.model?.id ?? "none")")

        case .unknown(let type, let raw):
            let rawString = String(data: raw, encoding: .utf8) ?? "?"
            debugStore?.addReceived(type: "unknown", summary: type, details: rawString)
        }
    }

    private func handleAssistantMessage(_ event: AssistantMessageEvent) {
        switch event {
        case .textDelta(let delta):
            guard !delta.isEmpty else { return }

            // Accumulate delta and schedule batched update
            pendingTextDelta += delta

            // Cancel existing update task and schedule new one
            textUpdateTask?.cancel()
            textUpdateTask = Task {
                try? await Task.sleep(nanoseconds: textUpdateInterval)
                guard !Task.isCancelled else { return }
                await flushTextDelta()
            }

        case .thinkingDelta:
            // Ignore thinking for now
            break
        case .messageStart:
            break
        case .messageEnd:
            // Flush any pending text when message ends
            Task {
                await flushTextDelta()
            }
        case .contentBlockStart, .contentBlockEnd:
            break
        case .toolUseStart, .toolUseInputDelta, .toolUseEnd:
            // Tool events handled separately via tool_execution events
            break
        case .unknown:
            break
        }
    }

    private func flushTextDelta() async {
        guard !pendingTextDelta.isEmpty else { return }

        let delta = pendingTextDelta
        pendingTextDelta = ""

        // Check if the LAST item is assistant text - if so, append to it
        // Otherwise create a new assistant text block
        if let lastItem = conversationItems.last,
           case .assistantText(let id, let existingText) = lastItem {
            // Append to existing (last item is assistant text)
            conversationItems[conversationItems.count - 1] = .assistantText(id: id, text: existingText + delta)
        } else {
            // Create new (last item is not assistant text, or no items)
            conversationItems.append(.assistantText(id: UUID().uuidString, text: delta))
        }
    }

    private func updateToolCall(id: String) {
        guard let index = conversationItems.firstIndex(where: { $0.id == id }),
              case .toolCall(_, let name, let args, _, _, let isExpanded) = conversationItems[index] else {
            return
        }

        conversationItems[index] = .toolCall(
            id: id,
            name: name,
            args: args,
            output: toolCallOutputs[id],
            status: toolCallStatuses[id] ?? .running,
            isExpanded: isExpanded
        )
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

    private func formatBlockInput(_ input: AnyCodable?) -> String? {
        guard let input else { return nil }

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        if let data = try? encoder.encode(input),
           let string = String(data: data, encoding: .utf8) {
            return string
        }
        return nil
    }
}

// MARK: - Preview

#Preview {
    MainView()
        .frame(width: 1000, height: 700)
}
