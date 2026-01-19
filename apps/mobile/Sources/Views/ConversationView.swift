//
//  ConversationView.swift
//  pi-mobile
//
//  Chat interface for conversing with the AI agent
//

import SwiftUI
import Textual
import PiCore
import PiUI

// MARK: - Conversation Item

enum ConversationItem: Identifiable {
    case userMessage(id: String, text: String)
    case assistantText(id: String, text: String)
    case toolCall(id: String, name: String, args: String?, output: String?, status: ToolCallStatus)

    var id: String {
        switch self {
        case .userMessage(let id, _): return id
        case .assistantText(let id, _): return id
        case .toolCall(let id, _, _, _, _): return id
        }
    }
}

// MARK: - Tool Call Navigation Item

struct ToolCallNavItem: Hashable {
    let id: String
    let name: String
    let args: String?
    let output: String?
    let status: ToolCallStatus

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - ConversationView

private struct ScrollBottomPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

struct ConversationView: View {
    let client: RPCClient
    let sessionId: String
    let onDisconnect: () -> Void

    @State private var items: [ConversationItem] = []
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var currentStreamingText = ""
    @State private var currentStreamingId: String?
    @State private var eventTask: Task<Void, Never>?
    @State private var errorMessage: String?
    @State private var showError = false
    @State private var autoScrollEnabled = true
    @State private var scrollViewHeight: CGFloat = 0
    @State private var lastGeneratedToolCallId: String?
    @State private var navigationPath = NavigationPath()

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Messages list
            ScrollViewReader { proxy in
                ZStack(alignment: .bottomTrailing) {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(items) { item in
                                itemView(item)
                                    .id(item.id)
                            }

                            // Show streaming text
                            if !currentStreamingText.isEmpty, let streamId = currentStreamingId {
                                assistantBubble(currentStreamingText)
                                    .id(streamId)
                            }

                            // Processing indicator
                            if isProcessing && currentStreamingText.isEmpty {
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
                .onChange(of: currentStreamingText) { _, _ in
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

            Divider()
                .background(Theme.borderMuted)

            // Input area
            inputArea
        }
        .background(Theme.pageBg)
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        Task { await clearConversation() }
                    } label: {
                        Label("Clear Chat", systemImage: "trash")
                    }

                    Button {
                        onDisconnect()
                    } label: {
                        Label("Disconnect", systemImage: "xmark.circle")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "An error occurred")
        }
        .navigationDestination(for: ToolCallNavItem.self) { item in
            ToolCallDetailView(
                toolName: item.name,
                args: item.args,
                output: item.output,
                status: item.status
            )
        }
        .task {
            // Attach to session first (sets _currentSessionId and subscribes to events)
            do {
                try await client.attachSession(sessionId: sessionId)
            } catch {
                print("[ConversationView] Failed to attach session: \(error)")
                showError(error.localizedDescription)
            }
            await startEventSubscription()
        }
        .onDisappear {
            eventTask?.cancel()
        }
    }

    // MARK: - Views

    @ViewBuilder
    private func itemView(_ item: ConversationItem) -> some View {
        switch item {
        case .userMessage(_, let text):
            userBubble(text)
        case .assistantText(_, let text):
            assistantBubble(text)
        case .toolCall(let id, let name, let args, let output, let status):
            toolCallCard(id: id, name: name, args: args, output: output, status: status)
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

    private func toolCallCard(id: String, name: String, args: String?, output: String?, status: ToolCallStatus) -> some View {
        // Use NavigationLink to navigate to detail view on tap
        NavigationLink(value: ToolCallNavItem(id: id, name: name, args: args, output: output, status: status)) {
            ToolCallHeader(
                toolName: name,
                args: args,
                status: status,
                showChevron: true
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.toolStatusBg(status))
        .cornerRadius(10)
        .padding(.horizontal, 16)
    }

    private var inputArea: some View {
        HStack(alignment: .bottom, spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.body)
                .foregroundColor(Theme.text)
                .focused($isInputFocused)
                .lineLimit(1...6)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.cardBg)
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Theme.borderMuted, lineWidth: 1)
                )

            if isProcessing {
                Button {
                    Task { await abortOperation() }
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(Theme.error)
                }
            } else {
                Button {
                    Task { await sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Theme.dim : Theme.accent)
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.inputBg)
    }

    // MARK: - Actions

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }

    private func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        // Add user message to items
        let userMessageId = UUID().uuidString
        items.append(.userMessage(id: userMessageId, text: text))
        inputText = ""
        isInputFocused = false
        autoScrollEnabled = true

        do {
            try await client.prompt(text)
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func abortOperation() async {
        do {
            try await client.abort()
        } catch {
            showError(error.localizedDescription)
        }
    }

    private func clearConversation() async {
        do {
            try await client.clearConversation()
            items.removeAll()
            currentStreamingText = ""
            currentStreamingId = nil
        } catch {
            showError(error.localizedDescription)
        }
    }

    // MARK: - Event Handling

    private func startEventSubscription() async {
        eventTask = Task {
            let events = await client.events

            for await event in events {
                guard !Task.isCancelled else { break }
                handleEvent(event)
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

            // Finalize any streaming text
            if !currentStreamingText.isEmpty, let streamId = currentStreamingId {
                items.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = nil
            }

            if !success, let error {
                showError(error.message)
            }

        case .turnStart:
            break

        case .turnEnd:
            break

        case .messageStart:
            break

        case .messageEnd:
            // Finalize streaming text
            if !currentStreamingText.isEmpty, let streamId = currentStreamingId {
                items.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

        case .messageUpdate(_, let assistantEvent):
            handleAssistantEvent(assistantEvent)

        case .toolExecutionStart(let toolCallId, let toolName, let args):
            // Finalize any streaming text first
            if !currentStreamingText.isEmpty, let streamId = currentStreamingId {
                items.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

            let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
            if toolCallId.isEmpty {
                lastGeneratedToolCallId = resolvedId
            }

            // Check if entry already exists (from toolUseStart) - update args if so
            if let existingIndex = items.firstIndex(where: { $0.id == resolvedId }) {
                if case .toolCall(let id, let name, _, let output, let status) = items[existingIndex] {
                    let argsString = args?.jsonString
                    items[existingIndex] = .toolCall(
                        id: id,
                        name: name,
                        args: argsString,
                        output: output,
                        status: status
                    )
                }
            } else {
                let argsString = args?.jsonString
                items.append(.toolCall(
                    id: resolvedId,
                    name: toolName,
                    args: argsString,
                    output: nil,
                    status: .running
                ))
            }

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

        case .autoRetryStart:
            break

        case .autoRetryEnd:
            break

        case .hookError(_, _, let errorMsg):
            if let errorMsg {
                showError("Hook error: \(errorMsg)")
            }

        case .stateUpdate:
            break

        case .unknown:
            break
        }
    }

    private func handleAssistantEvent(_ event: AssistantMessageEvent) {
        switch event {
        case .textDelta(let delta):
            currentStreamingText += delta

        case .thinkingDelta:
            // Could show thinking indicator, for now ignore
            break

        case .toolUseStart(let toolCallId, let toolName):
            // Finalize streaming text
            if !currentStreamingText.isEmpty, let streamId = currentStreamingId {
                items.append(.assistantText(id: streamId, text: currentStreamingText))
                currentStreamingText = ""
                currentStreamingId = UUID().uuidString
            }

            let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
            if toolCallId.isEmpty {
                lastGeneratedToolCallId = resolvedId
            }

            items.append(.toolCall(
                id: resolvedId,
                name: toolName,
                args: nil,
                output: nil,
                status: .running
            ))

        case .toolUseInputDelta(let toolCallId, let delta):
            // Update args for the tool call
            let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
            if let index = items.firstIndex(where: { $0.id == resolvedId }) {
                if case .toolCall(let id, let name, let existingArgs, let output, let status) = items[index] {
                    let newArgs = (existingArgs ?? "") + delta
                    items[index] = .toolCall(id: id, name: name, args: newArgs, output: output, status: status)
                }
            }

        case .toolUseEnd:
            break

        case .messageStart:
            break

        case .messageEnd:
            break

        case .contentBlockStart:
            break

        case .contentBlockEnd:
            break

        case .unknown:
            break
        }
    }

    private func updateToolCall(id: String, output: String?, status: ToolCallStatus) {
        if let index = items.firstIndex(where: { $0.id == id }) {
            if case .toolCall(let existingId, let name, let args, let existingOutput, _) = items[index] {
                let newOutput = output ?? existingOutput
                items[index] = .toolCall(id: existingId, name: name, args: args, output: newOutput, status: status)
            }
        }
    }

    // MARK: - Helpers

    private func showError(_ message: String) {
        errorMessage = message
        showError = true
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        // Note: Preview won't work without actual client
        // This is just for layout preview
        VStack {
            Text("Preview not available - requires RPCClient")
                .foregroundColor(.gray)
        }
    }
}
