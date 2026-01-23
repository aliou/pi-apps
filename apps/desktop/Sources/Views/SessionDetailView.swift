//
//  SessionDetailView.swift
//  pi
//
//  Detail view for an active session showing conversation
//

import SwiftUI
import PiCore
import PiUI

struct SessionDetailView: View {
    let session: DesktopSession
    let engine: SessionEngine
    let sessionManager: SessionManager

    @State private var expandedToolCalls: Set<String> = []
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            conversationArea
            Divider()
            inputArea
        }
        .navigationTitle(session.displayTitle)
        .navigationSubtitle(contextSubtitle)
        .toolbar {
            ToolbarItem(placement: .status) {
                connectionStatusView
            }
        }
    }

    // MARK: - Subviews

    private var conversationArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                conversationContent
                    .padding(16)
            }
            .onChange(of: engine.messages.count) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: engine.streamingText) { _, _ in
                scrollToBottom(proxy)
            }
        }
    }

    private var conversationContent: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(engine.messages) { item in
                SessionConversationItemView(
                    item: item,
                    isExpanded: expandedToolCalls.contains(item.id)
                ) {
                    toggleToolCall(item.id)
                }
                .id(item.id)
            }

            if engine.isProcessing && engine.streamingText.isEmpty && engine.messages.isEmpty {
                ProcessingIndicatorView()
                    .id("processing")
            }

            Color.clear
                .frame(height: 1)
                .id("bottom")
        }
    }

    private var inputArea: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .focused($isInputFocused)
                .lineLimit(1...5)
                .onSubmit { sendMessage() }

            sendOrAbortButton
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var sendOrAbortButton: some View {
        if engine.isProcessing {
            Button {
                Task { await engine.abort() }
            } label: {
                Image(systemName: "stop.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Theme.error)
            }
            .buttonStyle(.plain)
        } else {
            Button { sendMessage() } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(inputText.isEmpty ? .secondary : Theme.accent)
            }
            .buttonStyle(.plain)
            .disabled(inputText.isEmpty)
        }
    }

    private var connectionStatusView: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(connectionColor)
                .frame(width: 8, height: 8)
            Text(connectionStatus)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Computed Properties

    private var contextSubtitle: String {
        if let repoName = session.repoName {
            return repoName
        }
        if let projectName = session.projectName {
            return projectName
        }
        if session.mode == .chat {
            return "Chat"
        }
        return ""
    }

    private var connectionColor: Color {
        guard let conn = sessionManager.activeConnection else {
            return Theme.error
        }
        return conn.isConnected ? Theme.success : Theme.error
    }

    private var connectionStatus: String {
        guard let conn = sessionManager.activeConnection else {
            return "Disconnected"
        }
        return conn.isConnected ? "Connected" : "Disconnected"
    }

    // MARK: - Actions

    private func toggleToolCall(_ id: String) {
        if expandedToolCalls.contains(id) {
            expandedToolCalls.remove(id)
        } else {
            expandedToolCalls.insert(id)
        }
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""

        sessionManager.touchSession(session.id)

        Task {
            await engine.send(text)
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        DispatchQueue.main.async {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        }
    }
}

// MARK: - Conversation Item View

struct SessionConversationItemView: View {
    let item: PiUI.ConversationItem
    var isExpanded: Bool = false
    var onToggle: (() -> Void)?

    var body: some View {
        Group {
            switch item {
            case .userMessage(_, let text, let queuedBehavior):
                UserMessageView(text: text, queuedBehavior: queuedBehavior)

            case .assistantText(_, let text):
                AssistantTextView(text: text)

            case .toolCall(_, let name, let args, let output, let status):
                ToolCallItemView(
                    name: name,
                    args: args,
                    output: output,
                    status: status,
                    isExpanded: isExpanded,
                    onToggle: onToggle
                )

            case .systemEvent(_, let event):
                SystemEventView(event: event)

            case .richContent(_, let content, let summary):
                RichContentItemView(content: content, summary: summary)
            }
        }
    }
}

// MARK: - User Message View

private struct UserMessageView: View {
    let text: String
    let queuedBehavior: StreamingBehavior?

    var body: some View {
        HStack {
            Spacer(minLength: 60)

            VStack(alignment: .trailing, spacing: 4) {
                Text(text)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Theme.accent.opacity(0.15))
                    .cornerRadius(12)

                if queuedBehavior != nil {
                    Text("Queued")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

// MARK: - Assistant Text View

private struct AssistantTextView: View {
    let text: String

    var body: some View {
        Text(text)
            .textSelection(.enabled)
    }
}

// MARK: - Tool Call Item View

private struct ToolCallItemView: View {
    let name: String
    let args: String?
    let output: String?
    let status: ToolCallStatus
    var isExpanded: Bool = false
    var onToggle: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            headerButton
            if isExpanded {
                expandedContent
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Theme.cardBg)
        .cornerRadius(8)
    }

    private var headerButton: some View {
        Button(action: { onToggle?() }) {
            HStack(spacing: 8) {
                statusIcon
                    .frame(width: 16, height: 16)

                Text(name)
                    .font(.system(.body, design: .monospaced))
                    .fontWeight(.medium)

                Spacer()

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
    }

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let args {
                DisclosureGroup("Arguments") {
                    Text(args)
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .background(Color.black.opacity(0.2))
                        .cornerRadius(4)
                }
            }

            if let output {
                DisclosureGroup("Output") {
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(output)
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 200)
                    .padding(8)
                    .background(Color.black.opacity(0.2))
                    .cornerRadius(4)
                }
            }
        }
        .padding(.leading, 24)
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .running:
            ProgressView()
                .scaleEffect(0.6)
        case .success:
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(Theme.success)
        case .error:
            Image(systemName: "xmark.circle.fill")
                .foregroundColor(Theme.error)
        }
    }
}

// MARK: - System Event View

private struct SystemEventView: View {
    let event: SystemEventType

    var body: some View {
        HStack {
            Spacer()
            eventContent
            Spacer()
        }
    }

    @ViewBuilder
    private var eventContent: some View {
        switch event {
        case .modelSwitch(let fromModel, let toModel):
            HStack(spacing: 4) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.caption)
                if let fromModel {
                    Text("Switched from \(fromModel) to \(toModel)")
                } else {
                    Text("Using \(toModel)")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(12)
        }
    }
}

// MARK: - Rich Content Item View

private struct RichContentItemView: View {
    let content: RichContentType
    let summary: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(summary)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("Rich content: \(String(describing: content))")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(12)
        .background(Theme.cardBg)
        .cornerRadius(8)
    }
}

// MARK: - Processing Indicator View

struct ProcessingIndicatorView: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.7)
            Text("Processing...")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Preview

#Preview {
    let engine = SessionEngine()
    let session = DesktopSession.localChat()

    return SessionDetailView(
        session: session,
        engine: engine,
        sessionManager: SessionManager()
    )
    .frame(width: 600, height: 500)
}
