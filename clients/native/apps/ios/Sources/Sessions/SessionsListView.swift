import SwiftUI
import PiCore
import PiUI

struct SessionsListView: View {
    let mode: Relay.SessionMode

    @Environment(AppState.self) private var appState
    @State private var store: SessionsStore?
    @State private var showNewSession = false
    @State private var selectedSessionId: String?
    @State private var isCreatingChat = false

    private var navigationTitle: String {
        mode == .chat ? "Chats" : "Code"
    }

    private var emptyStateIcon: String {
        mode == .chat ? "bubble.left" : "chevron.left.forwardslash.chevron.right"
    }

    private var emptyStateTitle: String {
        mode == .chat ? "No Chats" : "No Code Sessions"
    }

    private var emptyStateSubtitle: String {
        mode == .chat ? "Start a new chat to get going" : "Create a code session to get started"
    }

    private var emptyStateActionTitle: String {
        mode == .chat ? "New Chat" : "New Code Session"
    }

    var body: some View {
        Group {
            if let store {
                sessionsList(store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle(navigationTitle)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(emptyStateActionTitle, systemImage: "plus") {
                    if mode == .chat {
                        Task {
                            await createChatSession()
                        }
                    } else {
                        showNewSession = true
                    }
                }
                .disabled(isCreatingChat)
            }
        }
        .sheet(isPresented: $showNewSession) {
            NewSessionSheet(mode: mode) { sessionId in
                selectedSessionId = sessionId
            }
        }
        .navigationDestination(item: $selectedSessionId) { sessionId in
            if mode == .chat {
                ChatView(sessionId: sessionId)
            } else {
                CodeSessionView(sessionId: sessionId)
            }
        }
        .task {
            let sessionsStore = SessionsStore(client: appState.client)
            store = sessionsStore
            await sessionsStore.loadSessions()
        }
    }

    @ViewBuilder
    private func sessionsList(_ store: SessionsStore) -> some View {
        let filtered = store.sessions.filter { $0.mode == mode }

        if filtered.isEmpty && !store.isLoading {
            EmptyStateView(
                icon: emptyStateIcon,
                title: emptyStateTitle,
                subtitle: emptyStateSubtitle,
                actionTitle: emptyStateActionTitle,
                action: {
                    if mode == .chat {
                        Task {
                            await createChatSession()
                        }
                    } else {
                        showNewSession = true
                    }
                }
            )
        } else {
            List {
                ForEach(filtered) { session in
                    Button {
                        selectedSessionId = session.id
                    } label: {
                        SessionRowView(
                            id: session.id,
                            name: session.name,
                            firstUserMessage: session.firstUserMessage,
                            lastActivityAt: session.lastActivityAt,
                            mode: session.mode == .chat ? .chat : .code,
                            displayInfo: SessionDisplayInfo(
                                isAgentRunning: session.status == .active,
                                repoFullName: session.repoFullName ?? repoName(from: session.repoPath)
                            )
                        )
                    }
                    .buttonStyle(.plain)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task { await store.deleteSession(id: session.id) }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
            .refreshable {
                await store.loadSessions()
            }
        }
    }

    private func createChatSession() async {
        guard let store else { return }
        isCreatingChat = true
        do {
            let sessionId = try await store.createSession(mode: .chat, repoId: nil, environmentId: nil)
            selectedSessionId = sessionId
        } catch {
            // Error creating session - could show an alert here
        }
        isCreatingChat = false
    }

    private func repoName(from repoPath: String?) -> String? {
        guard let repoPath, !repoPath.isEmpty else { return nil }
        return URL(fileURLWithPath: repoPath).lastPathComponent
    }
}

#Preview("Chat Mode") {
    NavigationStack {
        SessionsListView(mode: .chat)
    }
    .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}

#Preview("Code Mode") {
    NavigationStack {
        SessionsListView(mode: .code)
    }
    .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}
