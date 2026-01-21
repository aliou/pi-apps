//
//  SessionConversationView.swift
//  Pi
//
//  Conversation view for a specific session using NavigationStack
//

import SwiftUI
import PiCore
import PiUI

struct SessionConversationView: View {
    let session: SessionInfo

    @Environment(ServerConnection.self) private var connection
    @State private var engine = SessionEngine()
    @State private var inputText = ""
    @State private var isSetup = false
    @State private var settings = AppSettings.shared
    @State private var autoScrollEnabled = true
    @State private var isUserScrolling = false
    @State private var eventTask: Task<Void, Never>?
    @State private var lastScrollTime: Date = .distantPast

    private var trimmedInputText: String {
        inputText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            messageList
            inputArea
        }
        .navigationTitle(session.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await setupEngine()
        }
        .onDisappear {
            eventTask?.cancel()
            eventTask = nil
            Task {
                try? await connection.detachSession()
            }
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        ScrollViewReader { proxy in
            // List used to avoid ScrollView + LazyVStack stalling during streaming updates.
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
                // Throttle scroll during streaming to avoid performance issues
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

    // MARK: - Status Row

    @ViewBuilder
    private var statusRow: some View {
        if engine.isProcessing && engine.streamingText.isEmpty {
            ProcessingIndicatorView()
        } else {
            Color.clear.frame(height: 1)
        }
    }

    // MARK: - Input Area

    private var inputArea: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .focused($isInputFocused)
                .lineLimit(1...6)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .modifier(InputFieldModifier())
                .onSubmit {
                    Task { await send() }
                }

            Menu {
                Button("Send as Steer") {
                    Task { await send(overrideBehavior: .steer) }
                }
                Button("Send as Follow-up") {
                    Task { await send(overrideBehavior: .followUp) }
                }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(trimmedInputText.isEmpty ? .secondary : Theme.accent)
            } primaryAction: {
                Task { await send() }
            }
            .disabled(trimmedInputText.isEmpty)
            .modifier(GlassButtonModifier())

            if engine.isProcessing {
                Button {
                    Task { await engine.abort() }
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(Theme.error)
                }
                .modifier(GlassButtonModifier())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Setup

    private func setupEngine() async {
        guard !isSetup else { return }

        do {
            // Attach to session
            try await connection.attachSession(sessionId: session.sessionId)

            // Configure engine with callbacks
            engine.configure(callbacks: SessionEngineCallbacks(
                sendPrompt: { text, streamingBehavior in
                    let rpcBehavior = streamingBehavior.flatMap { PiCore.StreamingBehavior(rawValue: $0.rawValue) }
                    try await connection.prompt(text, streamingBehavior: rpcBehavior)
                },
                abort: {
                    try await connection.abort()
                }
            ))

            // Cancel any existing event task
            eventTask?.cancel()

            // Subscribe to events (each view gets its own subscription)
            eventTask = Task {
                for await event in connection.subscribe() {
                    guard !Task.isCancelled else { break }
                    await handleEvent(event)
                }
            }

            // Load existing messages
            let history = try await connection.getMessages()
            let items = convertMessagesToItems(history.messages)
            engine.setMessages(items)

            isSetup = true
        } catch {
            print("[SessionConversationView] Setup failed: \(error)")
        }
    }

    // MARK: - Event Handling

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

    // MARK: - Actions

    private func send(overrideBehavior: PiUI.StreamingBehavior? = nil) async {
        let text = trimmedInputText
        guard !text.isEmpty else { return }

        inputText = ""
        isInputFocused = false
        autoScrollEnabled = true

        let behavior = overrideBehavior ?? settings.streamingBehavior
        await engine.send(text, defaultStreamingBehavior: behavior)
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

    // MARK: - Message Conversion

    private func convertMessagesToItems(_ messages: [Message]) -> [ConversationItem] {
        var items: [ConversationItem] = []
        var toolResults: [String: String] = [:]

        // First pass: collect tool results
        for message in messages where message.role == .tool || message.role == .toolResult {
            if let toolCallId = message.toolCallId, let content = message.content {
                let output = extractText(from: content)
                if !output.isEmpty {
                    toolResults[toolCallId] = output
                }
            }
        }

        // Second pass: convert messages
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

// MARK: - Conversation Item View

struct ConversationItemView: View {
    let item: ConversationItem

    var body: some View {
        switch item {
        case .userMessage(_, let text, let queuedBehavior):
            if let queuedBehavior {
                VStack(alignment: .trailing, spacing: 4) {
                    HStack {
                        Spacer()
                        Text(queuedBehavior == .steer ? "steer" : "follow-up")
                            .font(.caption2)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .padding(.horizontal, 16)

                    MessageBubbleView(role: .user, text: text, isQueued: true)
                }
            } else {
                MessageBubbleView(role: .user, text: text)
            }

        case .assistantText(_, let text):
            MessageBubbleView(role: .assistant, text: text)

        case .toolCall(_, let name, let args, _, let status):
            ToolCallHeader(
                toolName: name,
                args: args,
                status: status,
                showChevron: false
            )
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Theme.toolStatusBg(status))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Glass Effect Modifiers

private struct InputFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.glassEffect(.regular, in: .rect(cornerRadius: 20))
    }
}

private struct GlassButtonModifier: ViewModifier {
    func body(content: Content) -> some View {
        content.glassEffect()
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        SessionConversationView(
            session: SessionInfo(
                sessionId: "test-123",
                createdAt: nil,
                lastActivityAt: nil,
                name: "Test Session",
                repoId: "aliou/pi-apps"
            )
        )
    }
    .environment(ServerConnection(serverURL: URL(string: "ws://localhost:8080")!))
}
