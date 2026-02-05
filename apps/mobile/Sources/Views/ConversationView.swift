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
    @State private var currentSession: RelaySession?
    @State private var currentMode: SessionMode = .chat
    @State private var currentModel: ModelInfo?
    @State private var availableModels: [Model] = []
    @State private var repos: [RepoInfo] = []
    @State private var sessions: [RelaySession] = []

    // Environment state
    @State private var environments: [RelayEnvironment] = []
    @State private var selectedEnvironment: RelayEnvironment?
    @State private var isLoadingEnvironments = false
    @State private var selectedRepo: RepoInfo?

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
    @State private var showEnvironmentSelector = false
    @State private var showBranchSelector = false

    // Input state
    @State private var inputText = ""
    @State private var slashCommandState = SlashCommandState()
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

    /// Whether the send button should be enabled
    private var canSendMessage: Bool {
        guard !trimmedInputText.isEmpty else { return false }

        // If session exists, can always send
        if currentSession != nil {
            return true
        }

        // In code mode without session, require environment + repo
        if currentMode == .code {
            return selectedEnvironment != nil && selectedRepo != nil
        }

        // Chat mode can send without pre-selection
        return true
    }

    private var repoName: String? {
        guard let repoId = currentSession?.repoId else { return nil }
        return displayName(forRepoId: repoId)
    }

    private var recentModelIds: [String] {
        RecentSelections.loadRecentModelIds()
    }

    private var recentRepoIds: [Int] {
        RecentSelections.loadRecentRepoIds().compactMap { Int($0) }
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

                if currentMode == .code && currentSession == nil {
                    ContextBar(
                        environmentName: selectedEnvironment?.name,
                        repoName: selectedRepo?.fullName,
                        branchName: selectedRepo != nil ? (selectedRepo?.defaultBranch ?? "main") : nil,
                        onEnvironmentTap: { showEnvironmentSelector = true },
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
                    Task { await connection.disconnectFromSession() }
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
        .sheet(isPresented: $showEnvironmentSelector) {
            EnvironmentSelectorSheet(environments: environments) { env in
                selectedEnvironment = env
            }
        }
        .sheet(isPresented: $showBranchSelector) {
            branchUnavailableSheet
        }
        .onDisappear {
            eventTask?.cancel()
            eventTask = nil
            Task { await connection.disconnectFromSession() }
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
                    selectedEnvironment = nil
                    selectedRepo = nil
                    currentMode = .code
                    currentSession = nil
                    engine.clearMessages()
                    Task {
                        await loadEnvironments()
                        await loadRepos()
                    }
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
        VStack(spacing: 0) {
            if slashCommandState.isShowing {
                SlashCommandListView(
                    commands: slashCommandState.filteredCommands,
                    highlightedIndex: slashCommandState.highlightedIndex
                ) { command in
                    executeSlashCommand(command)
                }
                .padding(.horizontal)
                .padding(.bottom, 4)
            }

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
                .onChange(of: inputText) { _, newValue in
                    slashCommandState.update(text: newValue)
                }
                .onSubmit {
                    if let command = slashCommandState.selectedCommand() {
                        executeSlashCommand(command)
                    } else {
                        let text = trimmedInputText
                        guard !text.isEmpty else { return }
                        inputText = ""
                        isInputFocused = false
                        autoScrollEnabled = true
                        Task { await sendMessage(text) }
                    }
                }
                .submitLabel(.send)
                .onKeyPress(.upArrow) {
                    guard slashCommandState.isShowing else { return .ignored }
                    slashCommandState.moveUp()
                    return .handled
                }
                .onKeyPress(.downArrow) {
                    guard slashCommandState.isShowing else { return .ignored }
                    slashCommandState.moveDown()
                    return .handled
                }
                .onKeyPress(.escape) {
                    guard slashCommandState.isShowing else { return .ignored }
                    slashCommandState.dismiss()
                    return .handled
                }
                .onKeyPress(.tab) {
                    guard let command = slashCommandState.selectedCommand() else { return .ignored }
                    executeSlashCommand(command)
                    return .handled
                }

                Button {
                    let text = trimmedInputText
                    guard canSendMessage else { return }
                    inputText = ""
                    isInputFocused = false
                    autoScrollEnabled = true
                    Task { await sendMessage(text) }
                } label: {
                    Image(systemName: "arrow.up")
                        .fontWeight(.semibold)
                }
                .buttonStyle(CircleButtonStyle(filled: canSendMessage))
                .disabled(!canSendMessage)
            }
        }
    }

    // MARK: - Sheets

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
        await loadSessions()
        await loadEnvironments()
        // Models are loaded when model selector is opened
    }

    private func loadEnvironments() async {
        guard !isLoadingEnvironments else { return }
        isLoadingEnvironments = true
        defer { isLoadingEnvironments = false }

        do {
            environments = try await connection.listEnvironments()
            errorMessage = nil

            // Auto-select default environment if none selected
            if selectedEnvironment == nil {
                selectedEnvironment = environments.first { $0.isDefault }
            }
        } catch {
            print("[ConversationView] Failed to load environments: \(error)")
            // Don't show error banner - environments may not be configured yet
        }
    }

    private func loadModels() async {
        guard !isLoadingModels else {
            return
        }
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
        RecentSelections.addRecentRepoId(String(repo.id))
        selectedRepo = repo

        if let prompt = pendingPrompt {
            pendingPrompt = nil
            await createCodeSession(repoId: String(repo.id), initialPrompt: prompt)
        }
        // Don't auto-create session - wait for user to send message
    }

    private func createChatSession(initialPrompt: String?) async {
        do {
            let session = try await connection.createSession(
                mode: .chat,
                modelProvider: serverConfig.selectedModelProvider,
                modelId: serverConfig.selectedModelId,
                systemPrompt: settings.effectiveChatSystemPrompt
            )

            currentMode = .chat
            await loadSessions()
            await connectToSession(session)

            if let initialPrompt {
                await engine.send(initialPrompt, defaultStreamingBehavior: settings.streamingBehavior)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to create chat session: \(error)")
        }
    }

    private func createCodeSession(repoId: String, initialPrompt: String?) async {
        guard let environment = selectedEnvironment else {
            errorMessage = "Please select an environment first"
            return
        }

        do {
            let session = try await connection.createSession(
                mode: .code,
                repoId: repoId,
                environmentId: environment.id,
                modelProvider: serverConfig.selectedModelProvider,
                modelId: serverConfig.selectedModelId
            )

            currentMode = .code
            await loadSessions()
            await connectToSession(session)

            // Clear selection state after session created
            selectedEnvironment = nil
            selectedRepo = nil

            if let initialPrompt {
                await engine.send(initialPrompt, defaultStreamingBehavior: settings.streamingBehavior)
            }
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to create code session: \(error)")
        }
    }

    private func selectSession(_ session: SessionHistoryItem) async {
        guard let match = sessions.first(where: { $0.id == session.id }) else { return }
        await connectToSession(match)
    }

    private func connectToSession(_ session: RelaySession) async {
        if currentSession?.id == session.id {
            return
        }

        eventTask?.cancel()
        eventTask = nil

        do {
            await connection.disconnectFromSession()
            engine.clearMessages()
            configureEngineIfNeeded()

            try await connection.connectToSession(session)
            currentSession = session
            currentMode = session.mode

            // Set the user's preferred model on the pi process
            if let provider = serverConfig.selectedModelProvider,
               let modelId = serverConfig.selectedModelId {
                currentModel = ModelInfo(id: modelId, name: modelId, provider: provider)
                do {
                    try await connection.setModel(provider: provider, modelId: modelId)
                } catch {
                    print("[ConversationView] Failed to set model on session: \(error)")
                }
            }

            startEventSubscription()

            let history = try await connection.getMessages()
            engine.setMessages(history.messages.toConversationItems())
            errorMessage = nil

            await loadSlashCommands()
        } catch {
            errorMessage = error.localizedDescription
            print("[ConversationView] Failed to connect to session: \(error)")
        }
    }

    private func deleteSession(_ session: SessionHistoryItem) async {
        do {
            try await connection.deleteSession(id: session.id)
            sessions.removeAll { $0.id == session.id }

            if currentSession?.id == session.id {
                eventTask?.cancel()
                eventTask = nil
                await connection.disconnectFromSession()
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

        if currentSession != nil {
            do {
                try await connection.setModel(provider: model.provider, modelId: model.id)
                currentModel = ModelInfo(from: model)
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
    private func executeSlashCommand(_ command: SlashCommand) {
        slashCommandState.dismiss()
        inputText = "/\(command.name) "
        isInputFocused = true
    }

    private func loadSlashCommands() async {
        do {
            let response = try await connection.getCommands()
            let commands = response.commands.map { SlashCommand(from: $0) }
            slashCommandState.setCommands(commands)
        } catch {
            print("[ConversationView] Failed to load slash commands: \(error)")
        }
    }

    private func sendMessage(_ text: String) async {
        guard !text.isEmpty else { return }

        // If session exists, send directly
        if currentSession != nil {
            configureEngineIfNeeded()
            await engine.send(text, defaultStreamingBehavior: settings.streamingBehavior)
            return
        }

        // Code mode: create session with environment + repo
        if currentMode == .code {
            guard let repo = selectedRepo else {
                pendingPrompt = text
                showRepoSelector = true
                return
            }
            await createCodeSession(repoId: String(repo.id), initialPrompt: text)
            return
        }

        // Chat mode: create session
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
            .filter { $0.mode == mode }
            .map { session in
                SessionHistoryItem(
                    id: session.id,
                    title: session.name,
                    firstMessage: nil,
                    repoName: displayName(forRepoId: session.repoId),
                    mode: session.mode,
                    lastActivityAt: session.lastActivityDate ?? Date()
                )
            }
            .sorted { $0.lastActivityAt > $1.lastActivityAt }
    }

    private func displayName(forRepoId repoId: String?) -> String? {
        guard let repoId, let repoIdInt = Int(repoId) else { return repoId }
        if let repo = repos.first(where: { $0.id == repoIdInt }) {
            return repo.fullName
        }
        return repoId
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
