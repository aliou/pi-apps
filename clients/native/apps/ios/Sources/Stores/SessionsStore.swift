import Foundation
import PiCore

@MainActor
@Observable
final class SessionsStore {
    private(set) var sessions: [Relay.RelaySession] = []
    private(set) var isLoading: Bool = false
    private(set) var error: String?

    // For code mode session creation
    private(set) var repos: [Relay.GitHubRepo] = []
    private(set) var environments: [Relay.RelayEnvironment] = []
    private(set) var models: [Relay.ModelInfo] = []

    private let client: Relay.RelayClient

    init(client: Relay.RelayClient) {
        self.client = client
    }

    func loadSessions() async {
        isLoading = true
        error = nil
        do {
            sessions = try await client.listSessions()
            sessions.sort { $0.lastActivityAt > $1.lastActivityAt }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadFormData() async {
        async let reposResult = client.listRepos()
        async let envsResult = client.listEnvironments()
        async let modelsResult = client.listModels()
        repos = (try? await reposResult) ?? []
        environments = (try? await envsResult) ?? []
        models = (try? await modelsResult) ?? []
    }

    func createSession(
        mode: Relay.SessionMode,
        repoId: String? = nil,
        environmentId: String? = nil,
        modelProvider: String? = nil,
        modelId: String? = nil
    ) async throws -> String {
        let request = Relay.CreateSessionRequest(
            mode: mode,
            repoId: repoId,
            environmentId: environmentId,
            modelProvider: modelProvider,
            modelId: modelId
        )
        let response = try await client.createSession(request)
        await loadSessions()
        return response.id
    }

    func deleteSession(id: String) async {
        try? await client.deleteSession(id: id)
        sessions.removeAll { $0.id == id }
    }
}
