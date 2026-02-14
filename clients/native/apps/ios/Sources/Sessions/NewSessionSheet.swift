import SwiftUI
import PiCore
import PiUI

struct NewSessionSheet: View {
    let mode: Relay.SessionMode
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var selectedRepoId: String?
    @State private var selectedEnvironmentId: String?
    @State private var isCreating = false
    @State private var store: SessionsStore?

    var body: some View {
        NavigationStack {
            Form {
                if let store {
                    Section("Repository") {
                        Picker("Repository", selection: $selectedRepoId) {
                            Text("Select a repo").tag(String?.none)
                            ForEach(store.repos) { repo in
                                Text(repo.fullName).tag(Optional(String(repo.id)))
                            }
                        }
                    }

                    Section("Environment") {
                        Picker("Environment", selection: $selectedEnvironmentId) {
                            Text("Default").tag(String?.none)
                            ForEach(store.environments) { env in
                                Text(env.name).tag(Optional(env.id))
                            }
                        }
                    }
                } else {
                    Section {
                        ProgressView("Loading...")
                    }
                }
            }
            .navigationTitle("New Code Session")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await createSession() }
                    }
                    .disabled(isCreating || selectedRepoId == nil)
                }
            }
            .task {
                let sessionsStore = SessionsStore(client: appState.client)
                store = sessionsStore
                await sessionsStore.loadFormData()
            }
        }
    }

    private func createSession() async {
        guard let store else { return }
        isCreating = true
        do {
            let id = try await store.createSession(
                mode: mode,
                repoId: selectedRepoId,
                environmentId: selectedEnvironmentId
            )
            dismiss()
            onCreated(id)
        } catch {
            isCreating = false
        }
    }
}

#Preview {
    NewSessionSheet(mode: .code) { _ in }
        .environment(AppState(relayURL: URL(string: "http://localhost:3000")!))
}
