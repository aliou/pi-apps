import SwiftUI
import PiCore
import PiUI

struct CodeSessionView: View {
    let sessionId: String

    @Environment(AppState.self) private var appState
    @State private var store: ConversationStore?
    @State private var inputText: String = ""

    var body: some View {
        Group {
            if let store {
                codeContent(store)
            } else {
                ProgressView("Connecting...")
            }
        }
        .navigationTitle("Code")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarVisibility(.hidden, for: .tabBar)
        #endif
        .task {
            if let store {
                if store.connectionState == .disconnected {
                    await store.connect()
                }
                return
            }

            let conversationStore = ConversationStore(
                client: appState.client,
                sessionId: sessionId
            )
            store = conversationStore
            await conversationStore.connect()
        }
    }

    @ViewBuilder
    private func codeContent(_ store: ConversationStore) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    ForEach(store.items) { item in
                        codeRow(item)
                            .id(item.id)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 8)
            }
            .onChange(of: store.items.last?.id) {
                if let lastId = store.items.last?.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
            .accessibilityIdentifier("code-messages-scroll")
        }
        .safeAreaInset(edge: .bottom) {
            ChatInputBar(
                text: $inputText,
                isAgentRunning: store.isAgentRunning,
                onSend: {
                    let text = inputText
                    inputText = ""
                    Task { await store.sendPrompt(text) }
                },
                onStop: {
                    Task { await store.abort() }
                }
            )
        }
        .toolbar {
            ToolbarItem(placement: .principal) {
                connectionStatus(store)
                    .accessibilityIdentifier("connection-status")
            }
        }
    }

    @ViewBuilder
    private func codeRow(_ item: Client.ConversationItem) -> some View {
        switch item {
        case .user(let msg):
            UserBubbleView(message: msg)

        case .assistant(let msg):
            AssistantMessageView(message: msg)

        case .reasoning(let reasoning):
            ReasoningRowView(item: reasoning)

        case .tool(let tool):
            ToolCallRow(tool: tool)

        case .system(let event):
            SystemEventRow(item: event)
        }
    }

    @ViewBuilder
    private func connectionStatus(_ store: ConversationStore) -> some View {
        switch store.connectionState {
        case .connected:
            if store.isAgentRunning {
                HStack(spacing: 4) {
                    StatusIndicator(.active)
                    Text("Running")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                EmptyView()
            }
        case .connecting:
            HStack(spacing: 4) {
                ProgressView()
                    .controlSize(.mini)
                Text("Connecting...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        case .error(let msg):
            Text(msg)
                .font(.caption)
                .foregroundStyle(.red)
        case .disconnected:
            Text("Disconnected")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview("Code Rows") {
    ScrollView {
        VStack(alignment: .leading, spacing: 8) {
            // User message
            UserBubbleView(
                message: Client.UserMessageItem(
                    id: "u1",
                    text: "Fix the login bug in auth.swift",
                    timestamp: "2026-02-09T12:00:00Z",
                    sendStatus: .sent
                )
            )

            // Reasoning
            ReasoningRowView(
                item: Client.ReasoningItem(
                    id: "r1",
                    text: "First I'll inspect auth.swift, then run tests to confirm a minimal fix.",
                    timestamp: "2026-02-09T12:00:00Z",
                    isStreaming: false
                )
            )

            // Assistant message
            AssistantMessageView(
                message: Client.AssistantMessageItem(
                    id: "a1",
                    text: "I'll look into the login bug. Let me read the file first.",
                    timestamp: "2026-02-09T12:00:00Z",
                    isStreaming: false
                )
            )

            // Tool calls
            ToolCallRow(
                tool: Client.ToolCallItem(
                    id: "t1",
                    name: "read",
                    argsJSON: "{\"path\": \"src/auth.swift\"}",
                    outputText: "import Foundation\n\nfunc login() {\n    // bug here\n}",
                    status: .success,
                    timestamp: "2026-02-09T12:00:01Z"
                )
            )

            ToolCallRow(
                tool: Client.ToolCallItem(
                    id: "t2",
                    name: "edit",
                    argsJSON: "{\"path\": \"src/auth.swift\", \"oldText\": \"// bug here\", \"newText\": \"// fixed\"}",
                    outputText: "",
                    status: .success,
                    timestamp: "2026-02-09T12:00:02Z"
                )
            )

            ToolCallRow(
                tool: Client.ToolCallItem(
                    id: "t3",
                    name: "bash",
                    argsJSON: "{\"command\": \"swift test\"}",
                    outputText: "",
                    status: .running,
                    timestamp: "2026-02-09T12:00:03Z"
                )
            )

            // System event
            SystemEventRow(
                item: Client.SystemItem(
                    id: "s1",
                    text: "Session activated",
                    timestamp: "2026-02-09T12:00:00Z"
                )
            )

            // Streaming assistant
            AssistantMessageView(
                message: Client.AssistantMessageItem(
                    id: "a2",
                    text: "The tests are passing now. I fixed the",
                    timestamp: "2026-02-09T12:00:04Z",
                    isStreaming: true
                )
            )
        }
        .padding(.horizontal)
    }
}
