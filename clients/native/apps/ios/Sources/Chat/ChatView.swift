import SwiftUI
import PiCore
import PiUI

struct ChatView: View {
    let sessionId: String

    @Environment(AppState.self) private var appState
    @State private var store: ConversationStore?
    @State private var inputText: String = ""
    @State private var isAtBottom: Bool = true

    var body: some View {
        Group {
            if let store {
                chatContent(store)
            } else {
                ProgressView("Connecting...")
            }
        }
        .navigationTitle("Chat")
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
    private func chatContent(_ store: ConversationStore) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(store.items) { item in
                        MessageRowView(item: item)
                            .id(item.id)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)
                .padding(.bottom, 8)
            }
            .onChange(of: store.items.last?.id) {
                if isAtBottom, let lastId = store.items.last?.id {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastId, anchor: .bottom)
                    }
                }
            }
            .accessibilityIdentifier("chat-messages-scroll")
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

#Preview {
    NavigationStack {
        ChatView(sessionId: "preview-session")
    }
    .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}
