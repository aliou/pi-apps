//
//  ConversationView.swift
//  pi-mobile
//
//  Chat interface for conversing with the AI agent
//

import SwiftUI
import PiCore

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

// MARK: - ConversationView

struct ConversationView: View {
    let client: RPCClient
    let sessionId: String
    let onDisconnect: () -> Void

    @State private var items: [ConversationItem] = []
    @State private var inputText = ""
    @State private var isProcessing = false
    @State private var expandedToolCalls: Set<String> = []
    @State private var currentStreamingText = ""
    @State private var currentStreamingId: String?
    @State private var eventTask: Task<Void, Never>?
    @State private var errorMessage: String?
    @State private var showError = false

    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Messages list
            ScrollViewReader { proxy in
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
                    }
                    .padding(.vertical, 12)
                }
                .onChange(of: items.count) { _, _ in
                    scrollToBottom(proxy)
                }
                .onChange(of: currentStreamingText) { _, _ in
                    scrollToBottom(proxy)
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

            Text(text)
                .font(.body)
                .foregroundColor(Theme.text)
                .textSelection(.enabled)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
    }

    private func toolCallCard(id: String, name: String, args: String?, output: String?, status: ToolCallStatus) -> some View {
        let isExpanded = expandedToolCalls.contains(id)
        let parsedArgs = parseArgs(args)

        return VStack(alignment: .leading, spacing: 0) {
            // Header - tappable
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isExpanded {
                        expandedToolCalls.remove(id)
                    } else {
                        expandedToolCalls.insert(id)
                    }
                }
            } label: {
                HStack(spacing: 10) {
                    Circle()
                        .fill(Theme.toolStatusColor(status))
                        .frame(width: 8, height: 8)

                    toolHeaderText(name: name, args: parsedArgs)

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Theme.dim)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Expanded content
            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    // Show args if present
                    if let args, !args.isEmpty {
                        Text("Arguments:")
                            .font(.caption)
                            .foregroundColor(Theme.dim)

                        Text(formatJSON(args))
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Theme.muted)
                            .textSelection(.enabled)
                    }

                    // Show output if present
                    if let output, !output.isEmpty {
                        Divider()
                            .background(Theme.borderMuted)

                        Text("Output:")
                            .font(.caption)
                            .foregroundColor(Theme.dim)

                        ScrollView {
                            Text(truncateOutput(output))
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(Theme.muted)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(maxHeight: 150)
                    }
                }
                .padding(.top, 10)
                .padding(.leading, 18)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.toolStatusBg(status))
        .cornerRadius(10)
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private func toolHeaderText(name: String, args: [String: Any]) -> some View {
        switch name {
        case "read":
            let path = shortenPath(args["path"] as? String ?? "")
            HStack(spacing: 4) {
                Text("read")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(1)
            }

        case "write":
            let path = shortenPath(args["path"] as? String ?? "")
            HStack(spacing: 4) {
                Text("write")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(1)
            }

        case "edit":
            let path = shortenPath(args["path"] as? String ?? "")
            HStack(spacing: 4) {
                Text("edit")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(1)
            }

        case "bash":
            let command = args["command"] as? String ?? ""
            HStack(spacing: 4) {
                Text("$")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(command.isEmpty ? "..." : truncateText(command, maxLength: 30))
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
            }

        case "grep":
            let pattern = args["pattern"] as? String ?? ""
            HStack(spacing: 4) {
                Text("grep")
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(pattern.isEmpty ? "..." : "/\(pattern)/")
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(Theme.accent)
                    .lineLimit(1)
            }

        default:
            HStack(spacing: 4) {
                Text(name)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
            }
        }
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

            let argsString = args?.jsonString
            items.append(.toolCall(
                id: toolCallId,
                name: toolName,
                args: argsString,
                output: nil,
                status: .running
            ))

        case .toolExecutionUpdate(let toolCallId, let output):
            updateToolCall(id: toolCallId, output: output, status: .running)

        case .toolExecutionEnd(let toolCallId, let output, let status):
            let toolStatus: ToolCallStatus = switch status {
            case .success: .success
            case .error, .cancelled: .error
            }
            updateToolCall(id: toolCallId, output: output, status: toolStatus)

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

            items.append(.toolCall(
                id: toolCallId,
                name: toolName,
                args: nil,
                output: nil,
                status: .running
            ))

        case .toolUseInputDelta(let toolCallId, let delta):
            // Update args for the tool call
            if let index = items.firstIndex(where: { $0.id == toolCallId }) {
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

    private func parseArgs(_ args: String?) -> [String: Any] {
        guard let args,
              let data = args.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }

    private func formatJSON(_ jsonString: String) -> String {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data),
              let prettyData = try? JSONSerialization.data(withJSONObject: json, options: .prettyPrinted),
              let prettyString = String(data: prettyData, encoding: .utf8) else {
            return jsonString
        }
        return prettyString
    }

    private func shortenPath(_ path: String) -> String {
        // Try to shorten long paths
        let components = path.components(separatedBy: "/")
        if components.count > 3 {
            return ".../" + components.suffix(2).joined(separator: "/")
        }
        return path
    }

    private func truncateText(_ text: String, maxLength: Int) -> String {
        let cleaned = text.replacingOccurrences(of: "\n", with: " ")
        if cleaned.count > maxLength {
            return String(cleaned.prefix(maxLength)) + "..."
        }
        return cleaned
    }

    private func truncateOutput(_ output: String) -> String {
        let lines = output.components(separatedBy: .newlines)
        let maxLines = 30
        if lines.count > maxLines {
            return lines.prefix(maxLines).joined(separator: "\n") + "\n... (\(lines.count - maxLines) more lines)"
        }
        return output
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
