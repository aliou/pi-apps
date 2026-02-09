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
            let conversationStore = ConversationStore(
                client: appState.client,
                sessionId: sessionId
            )
            store = conversationStore
            await conversationStore.connect()
        }
        .onDisappear {
            store?.disconnect()
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
            }
        }
    }

    @ViewBuilder
    private func codeRow(_ item: Client.ConversationItem) -> some View {
        switch item {
        case .user(let msg):
            // Compact user prompt in code view
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "person.circle.fill")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 14))
                    .padding(.top, 2)
                Text(msg.text)
                    .font(.body)
                    .foregroundStyle(.primary)
            }
            .padding(.vertical, 4)
            .opacity(msg.sendStatus == .sending ? 0.6 : 1.0)

        case .assistant(let msg):
            AssistantMessageView(message: msg)

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
