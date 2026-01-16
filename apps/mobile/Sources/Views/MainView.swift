//
//  MainView.swift
//  Pi
//
//  Main app view with sidebar overlay pattern (Claude mobile inspired)
//

import SwiftUI
import Textual
import PiCore

struct MainView: View {
    @StateObject private var serverConfig = ServerConfig.shared

    // Connection state
    @State private var client: RPCClient?
    @State private var isConnecting = false

    // Session state
    @State private var sessions: [SessionDisplayInfo] = []
    @State private var activeSessionId: String?
    @State private var activeRepoId: String?
    @State private var activeRepoName: String?

    // UI state
    @State private var showSidebar = false
    @State private var showRepoSelector = false
    @State private var showModelSelector = false
    @State private var showSettings = false
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var currentModel: Model?

    // Conversation state
    @State private var conversationItems: [ConversationItem] = []
    @State private var currentStreamingText = ""
    @State private var currentStreamingId: String?
    @State private var eventTask: Task<Void, Never>?
    @State private var lastGeneratedToolCallId: String?

    var body: some View {
        ZStack {
            // Main content
            mainContent

            // Sidebar overlay
            if showSidebar {
                sidebarOverlay
            }
        }
        .onAppear {
            if serverConfig.isConfigured && client == nil {
                Task { await connect() }
            }
        }
    }

    // MARK: - Main Content

    @ViewBuilder
    private var mainContent: some View {
        if !serverConfig.isConfigured {
            ServerSetupView {
                Task { await connect() }
            }
        } else if isConnecting {
            connectingView
        } else if client != nil {
            chatView
        } else {
            // Connection failed state
            connectionFailedView
        }
    }

    // MARK: - Chat View

    private var chatView: some View {
        VStack(spacing: 0) {
            // Navigation bar
            navigationBar

            // Content area
            if activeSessionId != nil {
                // Active conversation
                ConversationContentView(
                    items: conversationItems,
                    isProcessing: isProcessing,
                    streamingText: currentStreamingText,
                    streamingId: currentStreamingId
                )
            } else {
                // Empty state
                EmptyStateView()
            }

            // Input bar
            ChatInputBar(
                text: $inputText,
                repoName: activeRepoName,
                isProcessing: isProcessing,
                canSelectModel: true,
                onSend: { Task { await sendMessage() } },
                onAbort: { Task { await abortOperation() } },
                onRepoTap: { showRepoSelector = true },
                onModelTap: { showModelSelector = true }
            )
        }
        .background(Theme.pageBg)
        .sheet(isPresented: $showRepoSelector) {
            if let client {
                RepoSelectorSheet(client: client) { repo in
                    activeRepoId = repo.id
                    activeRepoName = repo.fullName ?? repo.name
                }
            }
        }
        .sheet(isPresented: $showModelSelector) {
            if let client {
                ModelSelectorSheet(client: client, currentModel: currentModel) { model in
                    Task { await selectModel(model) }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView(serverURL: serverConfig.serverURL) {
                    Task { await disconnect() }
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showSettings = false }
                    }
                }
            }
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        HStack {
            // Menu button (left - hamburger)
            Button {
                withAnimation(.easeInOut(duration: 0.25)) {
                    showSidebar = true
                }
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.text)
                    .frame(width: 44, height: 44)
            }

            Spacer()

            // Model selector (center)
            if let model = currentModel {
                Button {
                    showModelSelector = true
                } label: {
                    HStack(spacing: 4) {
                        Text(model.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(Theme.text)
                }
            }

            Spacer()

            // Settings button (right - gear)
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.text)
                    .frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 52)
        .background(Theme.pageBg)
    }

    // MARK: - Sidebar Overlay

    private var sidebarOverlay: some View {
        ZStack(alignment: .leading) {
            // Dimmed background
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showSidebar = false
                    }
                }

            // Sidebar (slides from left)
            SidebarView(
                sessions: sessions,
                selectedSessionId: activeSessionId,
                onSelectSession: { sessionId in
                    Task { await switchToSession(sessionId) }
                },
                onDeleteSession: { sessionId in
                    Task { await deleteSession(sessionId) }
                },
                onNewChat: {
                    startNewChat()
                },
                onClose: {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        showSidebar = false
                    }
                }
            )
            .frame(width: min(320, UIScreen.main.bounds.width * 0.85))
            .transition(.move(edge: .leading))
        }
    }

    // MARK: - Loading/Error States

    private var connectingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Connecting to server...")
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    private var connectionFailedView: some View {
        VStack(spacing: 24) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 48))
                .foregroundStyle(Theme.error)

            Text("Connection Failed")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.text)

            Text("Could not connect to the server")
                .foregroundStyle(Theme.textSecondary)

            HStack(spacing: 16) {
                Button("Retry") {
                    Task { await connect() }
                }
                .buttonStyle(.bordered)

                Button("Change Server") {
                    serverConfig.clearServerURL()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    // MARK: - Actions

    private func connect() async {
        guard let url = serverConfig.serverURL else { return }

        isConnecting = true
        defer { isConnecting = false }

        let newClient = RPCClient(serverURL: url)

        do {
            try await newClient.connect()
            client = newClient
            startEventSubscription(newClient)
            await loadInitialData()
        } catch {
            print("[MainView] Connection failed: \(error)")
            client = nil
        }
    }

    private func disconnect() async {
        showSettings = false
        await client?.disconnect()
        eventTask?.cancel()
        eventTask = nil
        client = nil
        activeSessionId = nil
        activeRepoId = nil
        activeRepoName = nil
        sessions = []
        conversationItems = []
        currentStreamingText = ""
        currentStreamingId = nil
        currentModel = nil
        serverConfig.clearServerURL()
    }

    private func loadInitialData() async {
        guard let client else { return }

        // Load sessions
        do {
            let sessionList = try await client.listSessions()
            sessions = sessionList.map { session in
                SessionDisplayInfo(
                    id: session.sessionId,
                    title: session.sessionId.prefix(8) + "...",  // TODO: Get real title
                    repoName: session.repoId  // TODO: Get repo name
                )
            }
        } catch {
            print("[MainView] Failed to load sessions: \(error)")
        }

        currentModel = nil
    }

    private func startEventSubscription(_ client: RPCClient) {
        eventTask?.cancel()
        eventTask = Task {
            let events = await client.events

            for await event in events {
                if Task.isCancelled { break }
                await MainActor.run {
                    handleEvent(event)
                }
            }
        }
    }

    @MainActor
    private func handleEvent(_ event: RPCEvent) {
        switch event {
        case .agentStart:
            isProcessing = true
            currentStreamingText = ""
            currentStreamingId = UUID().uuidString

        case .agentEnd(let success, let error):
            isProcessing = false

            if !currentStreamingText.isEmpty {
                let streamId = currentStreamingId ?? UUID().uuidString
                conversationItems.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = nil
            }

            if !success, let error {
                print("[MainView] Agent error: \(error.message)")
            }

        case .turnStart:
            break

        case .turnEnd:
            break

        case .messageStart(let _):
            break

        case .messageEnd(let _):
            if !currentStreamingText.isEmpty {
                let streamId = currentStreamingId ?? UUID().uuidString
                conversationItems.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

        case .messageUpdate(_, let assistantEvent):
            handleAssistantEvent(assistantEvent)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            if !currentStreamingText.isEmpty {
                let streamId = currentStreamingId ?? UUID().uuidString
                conversationItems.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

            let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
            if toolCallId.isEmpty {
                lastGeneratedToolCallId = resolvedId
            }

            let argsString = args?.jsonString
            conversationItems.append(.toolCall(
                id: resolvedId,
                name: toolName,
                args: argsString,
                output: nil,
                status: .running
            ))

        case .toolExecutionUpdate(let toolCallId, let output):
            let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
            updateToolCall(id: resolvedId, output: output, status: .running)

        case .toolExecutionEnd(let toolCallId, let output, let status):
            let toolStatus: ToolCallStatus = switch status {
            case .success: .success
            case .error, .cancelled: .error
            }
            let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
            updateToolCall(id: resolvedId, output: output, status: toolStatus)

        case .autoCompactionStart:
            break

        case .autoCompactionEnd:
            break

        case .autoRetryStart(let _, let _, let _, let _):
            break

        case .autoRetryEnd(let _, let _, let _):
            break

        case .hookError(_, _, let errorMsg):
            if let errorMsg {
                print("[MainView] Hook error: \(errorMsg)")
            }

        case .stateUpdate(let _):
            break

        case .unknown(let _, let _):
            break
        }
    }

    private func handleAssistantEvent(_ event: AssistantMessageEvent) {
        switch event {
        case .textDelta(let delta):
            currentStreamingText += delta

        case .thinkingDelta:
            break

        case .toolUseStart(let toolCallId, let toolName):
            if !currentStreamingText.isEmpty {
                let streamId = currentStreamingId ?? UUID().uuidString
                conversationItems.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

            let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
            if toolCallId.isEmpty {
                lastGeneratedToolCallId = resolvedId
            }

            conversationItems.append(.toolCall(
                id: resolvedId,
                name: toolName,
                args: nil,
                output: nil,
                status: .running
            ))

        case .toolUseInputDelta(let toolCallId, let delta):
            let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
            if let index = conversationItems.firstIndex(where: { $0.id == resolvedId }) {
                if case .toolCall(let id, let name, let existingArgs, let output, let status) = conversationItems[index] {
                    let newArgs = (existingArgs ?? "") + delta
                    conversationItems[index] = .toolCall(
                        id: id,
                        name: name,
                        args: newArgs,
                        output: output,
                        status: status
                    )
                }
            }

        case .toolUseEnd(let _):
            break

        case .messageStart(let _):
            break

        case .messageEnd(let _):
            break

        case .contentBlockStart(let _, let _):
            break

        case .contentBlockEnd(let _):
            break

        case .unknown(let _):
            break
        }
    }

    private func updateToolCall(id: String, output: String?, status: ToolCallStatus) {
        if let index = conversationItems.firstIndex(where: { $0.id == id }) {
            if case .toolCall(let existingId, let name, let args, let existingOutput, _) = conversationItems[index] {
                let newOutput = output ?? existingOutput
                conversationItems[index] = .toolCall(
                    id: existingId,
                    name: name,
                    args: args,
                    output: newOutput,
                    status: status
                )
            }
        }
    }

    /// Sync model state for the active session
    private func syncModelForSession(_ sessionId: String) async {
        guard let client else { return }

        if serverConfig.hasStoredModel,
           let modelId = serverConfig.selectedModelId,
           let provider = serverConfig.selectedModelProvider,
           currentModel?.id != modelId || currentModel?.provider != provider {
            do {
                try await client.setModel(provider: provider, modelId: modelId, sessionId: sessionId)
                print("[MainView] Restored model: \(provider)/\(modelId)")
            } catch {
                print("[MainView] Failed to restore model: \(error)")
                serverConfig.clearSelectedModel()
            }
        }

        do {
            let state = try await client.getState(sessionId: sessionId)
            currentModel = state.model
        } catch {
            print("[MainView] Failed to load state: \(error)")
        }
    }

    private func switchToSession(_ sessionId: String) async {
        guard let client else { return }

        do {
            // Detach from current session if any
            if activeSessionId != nil {
                try? await client.detachSession()
            }

            // Attach to new session
            try await client.attachSession(sessionId: sessionId)
            activeSessionId = sessionId
            currentStreamingText = ""
            currentStreamingId = nil
            await syncModelForSession(sessionId)

            // Load conversation history
            let messagesResponse = try await client.getMessages()
            // TODO: Convert messages to ConversationItems
            conversationItems = []

        } catch {
            print("[MainView] Failed to switch session: \(error)")
        }
    }

    private func deleteSession(_ sessionId: String) async {
        guard let client else { return }

        do {
            try await client.deleteSession(sessionId: sessionId)
            sessions.removeAll { $0.id == sessionId }

            if activeSessionId == sessionId {
                activeSessionId = nil
                conversationItems = []
            }
        } catch {
            print("[MainView] Failed to delete session: \(error)")
        }
    }

    private func startNewChat() {
        activeSessionId = nil
        conversationItems = []
        currentStreamingText = ""
        currentStreamingId = nil
        withAnimation(.easeInOut(duration: 0.25)) {
            showSidebar = false
        }
    }

    private func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let client else { return }

        // Need a repo selected
        guard let repoId = activeRepoId else {
            showRepoSelector = true
            return
        }

        inputText = ""

        // Create session if needed
        if activeSessionId == nil {
            do {
                let result = try await client.createSession(
                    repoId: repoId,
                    preferredProvider: serverConfig.selectedModelProvider,
                    preferredModelId: serverConfig.selectedModelId
                )
                activeSessionId = result.sessionId
                try await client.attachSession(sessionId: result.sessionId)
                await syncModelForSession(result.sessionId)
            } catch {
                print("[MainView] Failed to create session: \(error)")
                return
            }
        }

        // Add user message
        let userMessageId = UUID().uuidString
        conversationItems.append(.userMessage(id: userMessageId, text: text))

        // Send prompt
        do {
            isProcessing = true
            try await client.prompt(text)
        } catch {
            print("[MainView] Failed to send prompt: \(error)")
        }
    }

    private func abortOperation() async {
        guard let client else { return }

        do {
            try await client.abort()
            isProcessing = false
        } catch {
            print("[MainView] Failed to abort: \(error)")
        }
    }

    private func selectModel(_ model: Model) async {
        guard let client else { return }

        // Persist selection for use on next session
        serverConfig.setSelectedModel(provider: model.provider, modelId: model.id)
        currentModel = model

        guard let sessionId = activeSessionId else { return }

        do {
            try await client.setModel(provider: model.provider, modelId: model.id, sessionId: sessionId)
        } catch {
            print("[MainView] Failed to set model: \(error)")
        }
    }
}

// MARK: - Conversation Content View (extracted from ConversationView)

private struct ScrollBottomPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct ConversationContentView: View {
    let items: [ConversationItem]
    let isProcessing: Bool
    let streamingText: String
    let streamingId: String?
    @State private var autoScrollEnabled = true
    @State private var scrollViewHeight: CGFloat = 0

    var body: some View {
        ScrollViewReader { proxy in
            ZStack(alignment: .bottomTrailing) {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(items) { item in
                            ConversationItemView(item: item)
                                .id(item.id)
                        }

                        if !streamingText.isEmpty, let streamId = streamingId {
                            streamingBubble(streamingText)
                                .id(streamId)
                        }

                        if isProcessing && streamingText.isEmpty {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Thinking...")
                                    .font(.subheadline)
                                    .foregroundColor(Theme.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .id("processing")
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                            .background(
                                GeometryReader { geometry in
                                    Color.clear.preference(
                                        key: ScrollBottomPreferenceKey.self,
                                        value: geometry.frame(in: .named("scroll")).maxY
                                    )
                                }
                            )
                    }
                    .padding(.vertical, 12)
                }
                .coordinateSpace(name: "scroll")
                .background(
                    GeometryReader { geometry in
                        Color.clear
                            .onAppear {
                                scrollViewHeight = geometry.size.height
                            }
                            .onChange(of: geometry.size.height) { _, newValue in
                                scrollViewHeight = newValue
                            }
                    }
                )
                .simultaneousGesture(
                    DragGesture().onChanged { _ in
                        autoScrollEnabled = false
                    }
                )

                if !autoScrollEnabled {
                    Button {
                        autoScrollEnabled = true
                        scrollToBottom(proxy)
                    } label: {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(Theme.accent)
                            .shadow(radius: 2)
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
                }
            }
            .onChange(of: items.count) { _, _ in
                if autoScrollEnabled {
                    scrollToBottom(proxy)
                }
            }
            .onChange(of: streamingText) { _, _ in
                if autoScrollEnabled {
                    scrollToBottom(proxy)
                }
            }
            .onPreferenceChange(ScrollBottomPreferenceKey.self) { bottomMaxY in
                guard scrollViewHeight > 0 else { return }
                let distanceToBottom = bottomMaxY - scrollViewHeight
                let isNearBottom = distanceToBottom <= 32
                if autoScrollEnabled != isNearBottom {
                    autoScrollEnabled = isNearBottom
                }
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func streamingBubble(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .textual.overflowMode(.scroll)
                .font(.body)
                .foregroundStyle(Theme.text)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Conversation Item View

struct ConversationItemView: View {
    let item: ConversationItem

    var body: some View {
        switch item {
        case .userMessage(_, let text):
            userBubble(text)
        case .assistantText(_, let text):
            assistantBubble(text)
        case .toolCall(let id, let name, let args, let output, let status):
            Text("Tool: \(name)")  // TODO: Proper tool call view
                .padding(.horizontal, 16)
        }
    }

    private func userBubble(_ text: String) -> some View {
        HStack {
            Spacer(minLength: 60)
            Text(text)
                .font(.body)
                .foregroundColor(Theme.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.userMessageBg)
                .cornerRadius(16)
        }
        .padding(.horizontal, 16)
    }

    private func assistantBubble(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .textual.overflowMode(.scroll)
                .font(.body)
                .foregroundStyle(Theme.text)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Preview

#Preview("Empty State") {
    MainView()
}
