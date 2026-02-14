import SwiftUI
import PiCore
import PiUI

struct MacRootView: View {
    @Environment(AppState.self) private var appState

    @State private var mode: Relay.SessionMode = .chat
    @State private var query: String = ""
    @State private var showArchived: Bool = false

    @State private var store: SessionsStore?
    @State private var selectedSessionId: String?
    @State private var showNewSession = false
    @State private var isCreatingChat = false

    var body: some View {
        Group {
            if let store {
                NavigationSplitView {
                    sidebar(store)
                } detail: {
                    detail(store)
                }
            } else {
                ProgressView("Loading sessions…")
            }
        }
        .task {
            guard store == nil else { return }
            let sessionsStore = SessionsStore(client: appState.client)
            store = sessionsStore
            await sessionsStore.loadSessions()
        }
        .sheet(isPresented: $showNewSession) {
            NewSessionSheet(mode: .code) { sessionId in
                selectedSessionId = sessionId
            }
        }
    }

    // swiftlint:disable function_body_length
    @ViewBuilder
    private func sidebar(_ store: SessionsStore) -> some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Sessions")
                    .font(.headline)

                Picker("Mode", selection: $mode) {
                    Text("Chat").tag(Relay.SessionMode.chat)
                    Text("Code").tag(Relay.SessionMode.code)
                }
                .pickerStyle(.segmented)

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search…", text: $query)
                        .textFieldStyle(.plain)

                    Menu {
                        Toggle("Show archived", isOn: $showArchived)
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .foregroundStyle(.secondary)
                    }
                    .menuStyle(.borderlessButton)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.quaternary, in: .rect(cornerRadius: 8))

                Button {
                    if mode == .chat {
                        Task { await createChatSession(store) }
                    } else {
                        showNewSession = true
                    }
                } label: {
                    Label(mode == .chat ? "New Chat" : "New Code Session", systemImage: "plus")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .disabled(isCreatingChat)
            }

            List(selection: $selectedSessionId) {
                ForEach(filteredSessions(store)) { session in
                    SessionRowView(
                        id: session.id,
                        name: session.name,
                        firstUserMessage: session.firstUserMessage,
                        lastActivityAt: session.lastActivityAt,
                        mode: session.mode == .chat ? .chat : .code,
                        displayInfo: SessionDisplayInfo(
                            status: displayStatus(for: session.status),
                            repoFullName: session.repoFullName ?? repoName(from: session.repoPath)
                        )
                    )
                    .tag(session.id)
                    .contextMenu {
                        if session.status != .archived {
                            Button("Archive") {
                                Task { await store.archiveSession(id: session.id) }
                            }
                        }

                        Button("Delete", role: .destructive) {
                            Task { await store.deleteSession(id: session.id) }
                        }
                    }
                }
            }
            .listStyle(.sidebar)
        }
        .padding(12)
        .frame(minWidth: 300)
    }
    // swiftlint:enable function_body_length

    @ViewBuilder
    private func detail(_ store: SessionsStore) -> some View {
        if let selectedSessionId,
           let session = store.sessions.first(where: { $0.id == selectedSessionId }) {
            NavigationStack {
                if session.mode == .chat {
                    ChatView(sessionId: selectedSessionId)
                } else {
                    CodeSessionView(sessionId: selectedSessionId)
                }
            }
        } else {
            ContentUnavailableView(
                "Select a Session",
                systemImage: "bubble.left.and.bubble.right",
                description: Text("Pick a chat or code session from the sidebar.")
            )
        }
    }

    private func filteredSessions(_ store: SessionsStore) -> [Relay.RelaySession] {
        let queryText = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return store.sessions
            .filter { $0.mode == mode }
            .filter { showArchived || $0.status != .archived }
            .filter { session in
                guard !queryText.isEmpty else { return true }

                let haystack = [
                    session.name,
                    session.firstUserMessage,
                    session.repoFullName,
                    repoName(from: session.repoPath)
                ]
                .compactMap { $0?.lowercased() }
                .joined(separator: " ")

                return haystack.contains(queryText)
            }
            .sorted { $0.lastActivityAt > $1.lastActivityAt }
    }

    private func createChatSession(_ store: SessionsStore) async {
        isCreatingChat = true
        defer { isCreatingChat = false }

        do {
            let sessionId = try await store.createSession(mode: .chat, repoId: nil, environmentId: nil)
            selectedSessionId = sessionId
        } catch {
            // Keep silent for now; we'll add explicit error surfacing in a later pass.
        }
    }

    private func displayStatus(for status: Relay.SessionStatus) -> SessionDisplayStatus {
        switch status {
        case .creating: .creating
        case .active: .active
        case .idle: .idle
        case .archived: .archived
        case .error: .error
        }
    }

    private func repoName(from repoPath: String?) -> String? {
        guard let repoPath, !repoPath.isEmpty else { return nil }
        return URL(fileURLWithPath: repoPath).lastPathComponent
    }
}

#Preview {
    MacRootView()
        .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}
