import SwiftUI
import PiCore
import PiUI

struct NewSessionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    let onCreated: (String) -> Void

    @State private var selectedMode: Relay.SessionMode = .chat
    @State private var selectedRepoId: String?
    @State private var selectedEnvironmentId: String?
    @State private var isCreating = false
    @State private var store: SessionsStore?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Mode", selection: $selectedMode) {
                        Text("Chat").tag(Relay.SessionMode.chat)
                        Text("Code").tag(Relay.SessionMode.code)
                    }
                    .pickerStyle(.segmented)
                }

                if selectedMode == .code {
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
            }
            .navigationTitle("New Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await createSession() }
                    }
                    .disabled(isCreating || (selectedMode == .code && selectedRepoId == nil))
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
                mode: selectedMode,
                repoId: selectedMode == .code ? selectedRepoId : nil,
                environmentId: selectedMode == .code ? selectedEnvironmentId : nil
            )
            dismiss()
            onCreated(id)
        } catch {
            isCreating = false
        }
    }
}
