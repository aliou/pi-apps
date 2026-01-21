//
//  ConversationView.swift
//  Pi
//
//  Main conversation view with redesigned UI, session management, and messaging.
//

import SwiftUI
import PiCore
import PiUI

struct ConversationView: View {
    @Environment(ServerConnection.self) private var connection

    @State private var serverConfig = ServerConfig.shared
    @State private var settings = AppSettings.shared
    @State private var engine = SessionEngine()
    @State private var isEngineConfigured = false

    // Session state
    @State private var currentSession: SessionInfo?
    @State private var currentMode: SessionMode = .chat
    @State private var currentModel: ModelInfo?
    @State private var availableModels: [Model] = []
    @State private var repos: [RepoInfo] = []
    @State private var sessions: [SessionInfo] = []

    // UI state
    @State private var errorMessage: String?
    @State private var isLoadingModels = false
    @State private var isLoadingRepos = false
    @State private var isLoadingSessions = false

    // Sheets
    @State private var showSettings = false
    @State private var showChatHistory = false
    @State private var showCodeSessions = false
    @State private var showModelSelector = false
    @State private var showRepoSelector = false
    @State private var showSandboxSelector = false
    @State private var showBranchSelector = false

    // Input state
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    // Scroll state
    @State private var autoScrollEnabled = true
    @State private var isUserScrolling = false
    @State private var lastScrollTime: Date = .distantPast

    // Async tasks
    @State private var eventTask: Task<Void, Never>?
    @State private var pendingPrompt: String?

    private var trimmedInputText: String {
        inputText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var hasMessages: Bool {
        !engine.messages.isEmpty
    }

    private var modelName: String? {
        if let currentModel {
            return currentModel.name
        }
        if let storedProvider = serverConfig.selectedModelProvider,
           let storedId = serverConfig.selectedModelId {
            return availableModels.first {
                $0.id == storedId && $0.provider == storedProvider
            }?.name
        }
        return nil
    }

    private var repoName: String? {
        guard let repoId = currentSession?.repoId else { return nil }
        return displayName(forRepoId: repoId)
    }

    private var recentModelIds: [String] {
        RecentSelections.loadRecentModelIds()
    }

    private var recentRepoIds: [String] {
        RecentSelections.loadRecentRepoIds()
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
                .padding(.horizontal)

            if let errorMessage {
                ErrorBannerView(
                    message: errorMessage,
                    onDismiss: { self.errorMessage = nil },
                    onRetry: { Task { await reloadData() } }
                )
                .padding(.top, 8)
            }

            if hasMessages {
                messageList
            } else {
                Spacer()
                EmptyConversationView(mode: currentMode, modelName: modelName)
                Spacer()
            }

            VStack(spacing: 12) {
                if !hasMessages {
                    SuggestionChipsView(
                        suggestions: currentMode == .chat ? Suggestion.chatSuggestions : Suggestion.codeSuggestions
                    ) { suggestion in
                        inputText = suggestion.title
                        if let subtitle = suggestion.subtitle {
                            inputText += " \(subtitle)"
                        }
                        isInputFocused = true
                    }
                }

                if currentMode == .code {
                    ContextBar(
                        sandboxName: nil,
                        repoName: repoName,
                        branchName: nil,
                        onSandboxTap: { showSandboxSelector = true },
                        onRepoTap: { showRepoSelector = true },
                        onBranchTap: { showBranchSelector = true }
                    )
                    .padding(.horizontal)
                }

                inputBar
                    .padding(.horizontal)
            }
        }
        .task {
            await reloadData()
        }
        .onChange(of: showChatHistory) { _, isShowing in
            if isShowing {
                Task { await loadSessions() }
            }
        }
        .onChange(of: showCodeSessions) { _, isShowing in
            if isShowing {
                Task { await loadSessions() }
            }
        }
        .onChange(of: showModelSelector) { _, isShowing in
            if isShowing {
                Task { await loadModels() }
            }
        }
        .onChange(of: showRepoSelector) { _, isShowing in
            if isShowing {
                Task { await loadRepos() }
            } else if currentSession == nil {
                pendingPrompt = nil
            }
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView(connection: connection) {
                    showSettings = false
                    Task { await connection.disconnect() }
                }
                .navigationTitle("Settings")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { showSettings = false }
                    }
                }
            }
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showChatHistory) {
            SessionHistorySheet(
                mode: .chat,
                sessions: chatHistoryItems,
                onSelect: { session in
                    Task { await selectSession(session) }
                },
                onDelete: { session in
                    Task { await deleteSession(session) }
                }
            )
        }
        .sheet(isPresented: $showCodeSessions) {
            SessionHistorySheet(
                mode: .code,
                sessions: codeHistoryItems,
                onSelect: { session in
                    Task { await selectSession(session) }
                },
                onDelete: { session in
                    Task { await deleteSession(session) }
                }
            )
        }
        .sheet(isPresented: $showModelSelector) {
            ModelSelectorSheet(
                models: availableModels,
                currentModel: selectedModel,
                recentModelIds: recentModelIds
            ) { model in
                Task { await selectModel(model) }
            }
        }
        .sheet(isPresented: $showRepoSelector) {
            RepoSelectorSheet(
                repos: repos,
                recentRepoIds: recentRepoIds
            ) { repo in
                Task { await handleRepoSelection(repo) }
            }
        }
        .sheet(isPresented: $showSandboxSelector) {
            sandboxUnavailableSheet
        }
        .sheet(isPresented: $showBranchSelector) {
            branchUnavailableSheet
        }
        .onDisappear {
            eventTask?.cancel()
            eventTask = nil
            Task { try? await connection.detachSession() }
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            NavigationPillView(
                showSettings: $showSettings,
                showChatHistory: $showChatHistory,
                showCodeSessions: $showCodeSessions
            )

            Spacer()

            ModelSelectorButton(modelName: modelName) {
                showModelSelector = true
            }

            Spacer()

            NewSessionMenu(
                onNewChat: { Task { await startNewChat() } },
                onNewCodeSession: {
                    pendingPrompt = nil
                    currentMode = .code
                    showRepoSelector = true
                }
            )
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(engine.messages) { item in
                    ConversationItemView(item: item)
                        .id(item.id)
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                statusRow
                    .id("status")
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                Color.clear
                    .frame(height: 1)
                    .id("bottom")
                    .listRowInsets(.init())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .simultaneousGesture(
                DragGesture()
                    .onChanged { _ in
                        isUserScrolling = true
                        autoScrollEnabled = false
                    }
                    .onEnded { _ in
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            isUserScrolling = false
                        }
                    }
            )
            .onChange(of: engine.messages.count) { _, _ in
                if autoScrollEnabled && !isUserScrolling {
                    scheduleScrollToBottom(proxy, animated: false)
                }
            }
            .onChange(of: engine.streamingText) { _, newValue in
                guard !newValue.isEmpty else { return }
                let now = Date()
                if autoScrollEnabled && !isUserScrolling && now.timeIntervalSince(lastScrollTime) > 0.1 {
                    lastScrollTime = now
                    scheduleScrollToBottom(proxy)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !autoScrollEnabled {
                    Button {
                        autoScrollEnabled = true
                        scrollToBottom(proxy)
                    } label: {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(Theme.accent)
                            .shadow(radius: 2)
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
                }
            }
        }
    }

    @ViewBuilder
    private var statusRow: some View {
        if engine.isProcessing && engine.streamingText.isEmpty {
            ProcessingIndicatorView()
        } else {
            Color.clear.frame(height: 1)
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 12) {
            Button {
                // TODO: Show attachment options
            } label: {
                Image(systemName: "plus")
            }
            .buttonStyle(CircleButtonStyle())

            TextField(
                currentMode == .chat ? "Ask anything..." : "Code anything...",
                text: $inputText,
                axis: .vertical
            )
            .textFieldStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .focused($isInputFocused)

            Button {
                let text = trimmedInputText
                guard !text.isEmpty else { return }
                inputText = ""
                isInputFocused = false
                autoScrollEnabled = true
                Task { await sendMessage(text) }
            } label: {
                Image(systemName: "arrow.up")
                    .fontWeight(.semibold)
            }
            .buttonStyle(CircleButtonStyle(filled: !trimmedInputText.isEmpty))
            .disabled(trimmedInputText.isEmpty)
        }
    }

    // MARK: - Sheets

    private var sandboxUnavailableSheet: some View {
        NavigationStack {
            ContentUnavailableView(
                "Sandboxes Coming Soon",
                systemImage: "shippingbox",
                description: Text("Remote sandbox environments are not yet available.")
            )
            .navigationTitle("Sandbox")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { showSandboxSelector = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private var branchUnavailableSheet: some View {
        NavigationStack {
            ContentUnavailableView(
                "Branch Switching Coming Soon",
                systemImage: "leaf",
                description: Text("Branch selection is not yet available.")
            )
            .navigationTitle("Branch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { showBranchSelector = false }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Data Loading

extension ConversationView {
    private func reloadData() async {
        await loadModels()
        await loadSessions()
    }

    private func loadModels() async {
        guard !isLoadingModels else { return }
        isLoadingModels = true
        defer { isLoadingModels = false }

        do {
            let response = try await connection.getAvailableModels()
            availableModels = response.models
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to load models: \(error)")
        }
    }

    private func loadRepos() async {
        guard !isLoadingRepos else { return }
        isLoadingRepos = true
        defer { isLoadingRepos = false }

        do {
            repos = try await connection.listRepos()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to load repos: \(error)")
        }
    }

    private func loadSessions() async {
        guard !isLoadingSessions else { return }
        isLoadingSessions = true
        defer { isLoadingSessions = false }

        do {
            sessions = try await connection.listSessions()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to load sessions: \(error)")
        }
    }
}

// MARK: - Session Management

extension ConversationView {
    private func startNewChat() async {
        pendingPrompt = nil
        await createChatSession(initialPrompt: nil)
    }

    private func handleRepoSelection(_ repo: RepoInfo) async {
        RecentSelections.addRecentRepoId(repo.id)
        if let prompt = pendingPrompt {
            pendingPrompt = nil
            await createCodeSession(repoId: repo.id, initialPrompt: prompt)
        } else {
            await createCodeSession(repoId: repo.id, initialPrompt: nil)
        }
    }

    private func createChatSession(initialPrompt: String?) async {
        do {
            let result = try await connection.createSession(
                mode: .chat,
                preferredProvider: serverConfig.selectedModelProvider,
                preferredModelId: serverConfig.selectedModelId,
                systemPrompt: settings.effectiveChatSystemPrompt
            )

            let session = SessionInfo(
                sessionId: result.sessionId,
                mode: .chat,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                lastActivityAt: nil,
                name: nil,
                repoId: nil
            )

            currentMode = .chat
            await loadSessions()
            await attachToSession(session)

            if let initialPrompt {
                await engine.send(initialPrompt, defaultStreamingBehavior: settings.streamingBehavior)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to create chat session: \(error)")
        }
    }

    private func createCodeSession(repoId: String, initialPrompt: String?) async {
        do {
            let result = try await connection.createSession(
                mode: .code,
                repoId: repoId,
                preferredProvider: serverConfig.selectedModelProvider,
                preferredModelId: serverConfig.selectedModelId
            )

            let session = SessionInfo(
                sessionId: result.sessionId,
                mode: .code,
                createdAt: ISO8601DateFormatter().string(from: Date()),
                lastActivityAt: nil,
                name: nil,
                repoId: repoId
            )

            currentMode = .code
            await loadSessions()
            await attachToSession(session)

            if let initialPrompt {
                await engine.send(initialPrompt, defaultStreamingBehavior: settings.streamingBehavior)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to create code session: \(error)")
        }
    }

    private func selectSession(_ session: SessionHistoryItem) async {
        guard let match = sessions.first(where: { $0.sessionId == session.id }) else { return }
        await attachToSession(match)
    }

    private func attachToSession(_ session: SessionInfo) async {
        if currentSession?.sessionId == session.sessionId {
            return
        }

        eventTask?.cancel()
        eventTask = nil

        do {
            try? await connection.detachSession()
            engine.clearMessages()
            configureEngineIfNeeded()

            currentModel = try await connection.attachSession(sessionId: session.sessionId)
            currentSession = session
            currentMode = session.resolvedMode

            startEventSubscription()

            let history = try await connection.getMessages()
            let items = convertMessagesToItems(history.messages)
            engine.setMessages(items)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to attach session: \(error)")
        }
    }

    private func deleteSession(_ session: SessionHistoryItem) async {
        do {
            try await connection.deleteSession(sessionId: session.id)
            sessions.removeAll { $0.sessionId == session.id }

            if currentSession?.sessionId == session.id {
                eventTask?.cancel()
                eventTask = nil
                try? await connection.detachSession()
                currentSession = nil
                currentModel = nil
                engine.clearMessages()
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to delete session: \(error)")
        }
    }
}

// MARK: - Model Selection

extension ConversationView {
    private var selectedModel: Model? {
        if let currentModel {
            return availableModels.first {
                $0.id == currentModel.id && $0.provider == currentModel.provider
            }
        }

        if let storedProvider = serverConfig.selectedModelProvider,
           let storedId = serverConfig.selectedModelId {
            return availableModels.first {
                $0.id == storedId && $0.provider == storedProvider
            }
        }

        return nil
    }

    private func selectModel(_ model: Model) async {
        RecentSelections.addRecentModelId(model.id)
        serverConfig.setSelectedModel(provider: model.provider, modelId: model.id)

        do {
            _ = try await connection.setDefaultModel(provider: model.provider, modelId: model.id)
        } catch {
            print("[ConversationView] Failed to set default model: \(error)")
        }

        if let session = currentSession {
            do {
                let updatedModel = try await connection.setModel(
                    provider: model.provider,
                    modelId: model.id,
                    sessionId: session.sessionId
                )
                currentModel = updatedModel
            } catch {
                errorMessage = "Failed to switch model: \(error.localizedDescription)"
                print("[ConversationView] Failed to switch model: \(error)")
            }
        } else {
            currentModel = ModelInfo(from: model)
        }
    }
}

// MARK: - Messaging

extension ConversationView {
    private func sendMessage(_ text: String) async {
        guard !text.isEmpty else { return }

        if let currentSession {
            configureEngineIfNeeded()
            await engine.send(text, defaultStreamingBehavior: settings.streamingBehavior)
            return
        }

        if currentMode == .code {
            pendingPrompt = text
            showRepoSelector = true
            return
        }

        await createChatSession(initialPrompt: text)
    }

    private func configureEngineIfNeeded() {
        guard !isEngineConfigured else { return }

        engine.configure(callbacks: SessionEngineCallbacks(
            sendPrompt: { text, streamingBehavior in
                let rpcBehavior = streamingBehavior.flatMap { PiCore.StreamingBehavior(rawValue: $0.rawValue) }
                try await connection.prompt(text, streamingBehavior: rpcBehavior)
            },
            abort: {
                try await connection.abort()
            }
        ))

        isEngineConfigured = true
    }

    private func startEventSubscription() {
        eventTask?.cancel()
        eventTask = Task {
            for await event in connection.subscribe() {
                guard !Task.isCancelled else { break }
                await handleEvent(event)
            }
        }
    }

    @MainActor
    private func handleEvent(_ event: RPCEvent) {
        switch event {
        case .agentStart:
            engine.handleAgentStart()

        case .agentEnd(let success, let error):
            engine.handleAgentEnd(success: success, errorMessage: error?.message)

        case .turnStart:
            engine.handleTurnStart()

        case .messageEnd:
            engine.handleMessageEnd()

        case .messageUpdate(_, let assistantEvent):
            handleAssistantEvent(assistantEvent)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            let argsString = args?.jsonString
            engine.handleToolExecutionStart(toolCallId: toolCallId, toolName: toolName, argsString: argsString)

        case .toolExecutionUpdate(let toolCallId, let output):
            engine.handleToolExecutionUpdate(toolCallId: toolCallId, output: output)

        case .toolExecutionEnd(let toolCallId, let output, let status):
            engine.handleToolExecutionEnd(toolCallId: toolCallId, output: output, success: status == .success)

        case .modelChanged(let model):
            let previousModel = currentModel?.name
            currentModel = model
            let item = ConversationItem.modelSwitch(from: previousModel, to: model.name)
            engine.appendMessage(item)

        default:
            break
        }
    }

    private func handleAssistantEvent(_ event: AssistantMessageEvent) {
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
}

// MARK: - Message Conversion

extension ConversationView {
    private func convertMessagesToItems(_ messages: [Message]) -> [ConversationItem] {
        var items: [ConversationItem] = []
        var toolResults: [String: String] = [:]

        for message in messages where message.role == .tool || message.role == .toolResult {
            if let toolCallId = message.toolCallId, let content = message.content {
                let output = extractText(from: content)
                if !output.isEmpty {
                    toolResults[toolCallId] = output
                }
            }
        }

        for message in messages {
            switch message.role {
            case .user:
                if let content = message.content {
                    let text = extractText(from: content)
                    if !text.isEmpty {
                        items.append(.userMessage(id: message.id, text: text, queuedBehavior: nil))
                    }
                }

            case .assistant:
                if let content = message.content {
                    switch content {
                    case .text(let text):
                        if !text.isEmpty {
                            items.append(.assistantText(id: message.id, text: text))
                        }

                    case .structured(let blocks):
                        var textParts: [String] = []
                        var blockIndex = 0

                        for block in blocks {
                            switch block.type {
                            case .text:
                                if let text = block.text, !text.isEmpty {
                                    textParts.append(text)
                                }

                            case .toolUse, .toolCall:
                                if !textParts.isEmpty {
                                    let combinedText = textParts.joined(separator: "\n")
                                    let textId = "\(message.id)-text-\(blockIndex)"
                                    items.append(.assistantText(id: textId, text: combinedText))
                                    textParts = []
                                }

                                if let toolCallId = block.toolCallId, let toolName = block.toolName {
                                    let argsString = block.input?.jsonString
                                    let output = toolResults[toolCallId]
                                    items.append(.toolCall(
                                        id: toolCallId,
                                        name: toolName,
                                        args: argsString,
                                        output: output,
                                        status: .success
                                    ))
                                }

                            case .thinking, .toolResult:
                                break
                            }
                            blockIndex += 1
                        }

                        if !textParts.isEmpty {
                            let combinedText = textParts.joined(separator: "\n")
                            let textId = "\(message.id)-text-final"
                            items.append(.assistantText(id: textId, text: combinedText))
                        }
                    }
                }

            case .system, .tool, .toolResult:
                break
            }
        }

        return items
    }

    private func extractText(from content: MessageContent) -> String {
        switch content {
        case .text(let text):
            return text
        case .structured(let blocks):
            return blocks
                .filter { $0.type == .text }
                .compactMap(\.text)
                .joined(separator: "\n")
        }
    }
}

// MARK: - Helpers

extension ConversationView {
    private var chatHistoryItems: [SessionHistoryItem] {
        historyItems(for: .chat)
    }

    private var codeHistoryItems: [SessionHistoryItem] {
        historyItems(for: .code)
    }

    private func historyItems(for mode: SessionMode) -> [SessionHistoryItem] {
        sessions
            .filter { $0.resolvedMode == mode }
            .map { session in
                SessionHistoryItem(
                    id: session.sessionId,
                    title: session.name,
                    firstMessage: nil,
                    repoName: displayName(forRepoId: session.repoId),
                    mode: session.resolvedMode,
                    lastActivityAt: sessionLastActivityDate(session)
                )
            }
            .sorted { $0.lastActivityAt > $1.lastActivityAt }
    }

    private func displayName(forRepoId repoId: String?) -> String? {
        guard let repoId else { return nil }
        if let repo = repos.first(where: { $0.id == repoId }) {
            return repo.fullName ?? repo.name
        }
        return repoId
    }

    private func sessionLastActivityDate(_ session: SessionInfo) -> Date {
        if let lastActivity = session.lastActivityDate {
            return lastActivity
        }

        if let createdAt = session.createdAt,
           let createdDate = parseISODate(createdAt) {
            return createdDate
        }

        return Date()
    }

    private func parseISODate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    private func scheduleScrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        Task { @MainActor in
            await Task.yield()
            scrollToBottom(proxy, animated: animated)
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        if animated {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        } else {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }
}

/// Simple circle button style using semantic colors
private struct CircleButtonStyle: ButtonStyle {
    var filled: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(filled ? Color(uiColor: .systemBackground) : .primary)
            .padding(12)
            .background(in: Circle())
            .backgroundStyle(filled ? AnyShapeStyle(.primary) : AnyShapeStyle(.fill.tertiary))
            .opacity(configuration.isPressed ? 0.7 : 1.0)
    }
}

// MARK: - Previews

#Preview("Chat - Empty") {
    ConversationView()
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:8080")!))
}
