import SwiftUI
import PiCore
import PiUI

struct SessionsListView: View {
    @Environment(AppState.self) private var appState
    @State private var store: SessionsStore?
    @State private var showNewSession = false
    @State private var selectedSessionId: String?

    var body: some View {
        Group {
            if let store {
                sessionsList(store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Chats")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New Chat", systemImage: "plus") {
                    showNewSession = true
                }
            }
        }
        .sheet(isPresented: $showNewSession) {
            NewSessionSheet { sessionId in
                selectedSessionId = sessionId
            }
        }
        .navigationDestination(item: $selectedSessionId) { sessionId in
            ChatView(sessionId: sessionId)
        }
        .task {
            let sessionsStore = SessionsStore(client: appState.client)
            store = sessionsStore
            await sessionsStore.loadSessions()
        }
    }

    @ViewBuilder
    private func sessionsList(_ store: SessionsStore) -> some View {
        if store.sessions.isEmpty && !store.isLoading {
            EmptyStateView(
                icon: "bubble.left",
                title: "No Sessions",
                subtitle: "Start a new chat to get going",
                actionTitle: "New Chat",
                action: { showNewSession = true }
            )
        } else {
            List {
                ForEach(store.sessions) { session in
                    Button {
                        selectedSessionId = session.id
                    } label: {
                        SessionRowView(
                            id: session.id,
                            name: session.name,
                            lastActivityAt: session.lastActivityAt,
                            mode: session.mode == .chat ? .chat : .code,
                            displayInfo: SessionDisplayInfo(
                                repoFullName: nil
                            )
                        )
                    }
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
}
