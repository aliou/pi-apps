//
//  SessionDetailView.swift
//  pi
//
//  Detail view for an active session showing conversation
//

import SwiftUI
import PiCore
import PiUI
import Textual

struct SessionDetailView: View {
    let session: DesktopSession
    let engine: SessionEngine?
    let connectionState: SessionConnectionState
    let sessionManager: SessionManager

    @State private var expandedToolCalls: Set<String> = []
    @State private var inputText = ""
    @State private var showAuthSetup = false
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Header with connection status
            headerBar

            Divider()

            switch connectionState {
            case .idle, .connecting:
                connectingView
            case .connected:
                if let engine {
                    conversationArea(engine: engine)
                    Divider()
                    inputArea(engine: engine)
                } else {
                    connectingView
                }
            case .failed(let error):
                errorView(error: error)
            }
        }
        .navigationTitle(session.displayTitle)
        .navigationSubtitle(contextSubtitle)
        .sheet(isPresented: $showAuthSetup) {
            AuthSetupView {
                showAuthSetup = false
                // Retry connection after auth setup
                Task { await sessionManager.selectSession(session.id) }
            }
            .interactiveDismissDisabled()
        }
    }

    private var headerBar: some View {
        HStack {
            Spacer()
            Circle()
                .fill(connectionColor)
                .frame(width: 8, height: 8)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Connection State Views

    private var connectingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Connecting...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(error: String) -> some View {
        VStack(spacing: 16) {
            if sessionManager.needsAuthSetup {
                // Auth setup UI
                Image(systemName: "key")
                    .font(.largeTitle)
                    .foregroundStyle(.orange)
                Text("API Keys Required")
                    .font(.headline)
                Text("Configure your API keys to start chatting.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button("Set Up API Keys") {
                    showAuthSetup = true
                }
                .buttonStyle(.borderedProminent)
            } else {
                // Generic error UI
                Image(systemName: "exclamationmark.triangle")
                    .font(.largeTitle)
                    .foregroundStyle(.orange)
                Text("Connection Failed")
                    .font(.headline)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                Button("Retry") {
                    Task { await sessionManager.selectSession(session.id) }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Subviews

    private func conversationArea(engine: SessionEngine) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                conversationContent(engine: engine)
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

    private func conversationContent(engine: SessionEngine) -> some View {
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

    private func inputArea(engine: SessionEngine) -> some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .focused($isInputFocused)
                .lineLimit(1...5)
                .onSubmit { sendMessage(engine: engine) }

            sendOrAbortButton(engine: engine)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func sendOrAbortButton(engine: SessionEngine) -> some View {
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
            Button { sendMessage(engine: engine) } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(inputText.isEmpty ? .secondary : Theme.accent)
            }
            .buttonStyle(.plain)
            .disabled(inputText.isEmpty)
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

    // MARK: - Actions

    private func toggleToolCall(_ id: String) {
        if expandedToolCalls.contains(id) {
            expandedToolCalls.remove(id)
        } else {
            expandedToolCalls.insert(id)
        }
    }

    private func sendMessage(engine: SessionEngine) {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""

        Task {
            await sessionManager.sendMessage(for: session.id, text: text)
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
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .font(.body)

            Spacer(minLength: 40)
        }
    }
}

// MARK: - Tool Call Item View

// TODO: Harmonize this component with iOS ExpandableToolCallView (apps/mobile/Sources/Views/ExpandableToolCallView.swift)
private struct ToolCallItemView: View {
    let name: String
    let args: String?
    let output: String?
    let status: ToolCallStatus
    var isExpanded: Bool = false
    var onToggle: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header (tappable to expand/collapse)
            headerRow
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
                .onTapGesture {
                    onToggle?()
                }

            // Expanded content
            if isExpanded {
                expandedContent
                    .padding(.horizontal, 12)
                    .padding(.bottom, 10)
            }
        }
        .background(Theme.cardBg)
        .cornerRadius(8)
    }

    private var headerRow: some View {
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

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            if let args {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Arguments")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
                VStack(alignment: .leading, spacing: 4) {
                    Text("Output")
                        .font(.caption)
                        .foregroundStyle(.secondary)
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

            if status == .running && output == nil {
                HStack(spacing: 8) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Running...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
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
        connectionState: .connected,
        sessionManager: SessionManager()
    )
    .frame(width: 600, height: 500)
}
