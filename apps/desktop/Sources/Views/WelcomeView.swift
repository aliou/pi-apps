//
//  WelcomeView.swift
//  pi
//
//  Claude Desktop-style welcome view with dropdowns and input field
//

import SwiftUI
import PiCore
import PiUI

struct WelcomeView: View {
    let mode: SidebarMode
    let onCreateSession: (SessionCreationRequest) -> Void

    @State private var serverConfig = ServerConfig.shared

    // Environment selection (local or a specific remote environment)
    @State private var selectedEnvironment: SessionEnvironmentSelection = .local

    // Context selection
    @State private var selectedFolderPath: String?
    @State private var selectedRepo: RepoInfo?

    // Input
    @State private var promptText = ""

    // Remote environment state
    @State private var environments: [RelayEnvironment] = []
    @State private var isLoadingEnvironments = false
    @State private var environmentError: String?

    // Remote repo state
    @State private var repos: [RepoInfo] = []
    @State private var isLoadingRepos = false
    @State private var repoError: String?

    // Shared temp connection for API calls
    @State private var tempConnection: ServerConnection?

    // Folder picker sheet
    @State private var showFolderPicker = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Greeting with icon
            HStack(spacing: 10) {
                Image(systemName: mode == .chat ? "sparkle" : "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 28))
                    .foregroundStyle(Theme.accent)
                Text(greeting)
                    .font(.system(size: 28, weight: .regular))
                    .foregroundStyle(.primary)
            }

            if mode == .code {
                // Two dropdowns row
                HStack(spacing: 12) {
                    // Left: Context picker (folder or repo)
                    ContextPickerDropdown(
                        mode: mode,
                        isRemote: selectedEnvironment.isRemote,
                        recentFolders: recentFolders,
                        onSelectFolder: { path in
                            selectedFolderPath = path
                            ServerConfig.shared.addRecentFolder(path)
                        },
                        onChooseDifferentFolder: {
                            showFolderPicker = true
                        },
                        repos: repos,
                        recentRepoIds: serverConfig.recentRepoIds,
                        isLoadingRepos: isLoadingRepos,
                        repoError: repoError,
                        onSelectRepo: { repo in
                            selectedRepo = repo
                        },
                        onRefreshRepos: { Task { await loadRepos() } },
                        selectedFolderPath: $selectedFolderPath,
                        selectedRepo: $selectedRepo
                    )
                    .frame(width: 320)

                    // Right: Environment picker (local + remote environments)
                    EnvironmentPickerDropdown(
                        selection: $selectedEnvironment,
                        environments: environments,
                        isLoading: isLoadingEnvironments,
                        error: environmentError,
                        serverConfigured: serverConfig.isConfigured
                    ) { Task { await loadEnvironments() } }
                    .frame(width: 220)
                }
            }

            // Input field
            PromptInputField(
                text: $promptText,
                placeholder: mode == .chat
                    ? "How can I help you today?"
                    : "What would you like to do?",
                canSubmit: canSubmit
            ) { createSession() }
            .frame(maxWidth: 560)
            .padding(.horizontal, 40)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showFolderPicker) {
            FolderPickerView { path in
                selectedFolderPath = path
                ServerConfig.shared.addRecentFolder(path)
            }
        }
        .task {
            // Load environments on appear if server is configured
            if serverConfig.isConfigured {
                await loadEnvironments()
            }
        }
        .onChange(of: selectedEnvironment) { _, newValue in
            // Clear context selection when switching environment
            selectedFolderPath = nil
            selectedRepo = nil

            if newValue.isRemote {
                Task { await loadRepos() }
            }
        }
    }

    // MARK: - Computed Properties

    private var canSubmit: Bool {
        guard !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        if mode == .chat {
            return true
        }

        // Code mode: needs context selected
        if selectedEnvironment.isLocal {
            return selectedFolderPath != nil
        }

        // Remote code: needs both environment (already selected via type) and repo
        return selectedRepo != nil
    }

    private var recentFolders: [String] {
        ServerConfig.shared.recentFolders
    }

    // MARK: - Greetings

    private static let chatGreetings = [
        "What's on your mind?",
        "How can I help?",
        "What shall we explore?",
        "Ready when you are",
        "Let's figure it out",
        "Curious about something?",
        "What's the question?",
        "Let's think through this",
        "What would you like to know?",
        "I'm all ears",
        "Fire away",
        "What's up?",
        "Talk to me",
        "Thinking cap on",
        "Let's chat",
        "Ask me anything",
        "What's brewing?",
        "Penny for your thoughts?"
    ]

    private static let codeGreetings = [
        "What are we building?",
        "Ready to code",
        "Let's ship it",
        "What needs fixing?",
        "Time to build",
        "What's the task?",
        "Show me the code",
        "Let's hack on this",
        "What's broken?",
        "Feature or bug?",
        "Let's refactor",
        "Ready to deploy?",
        "What's next?",
        "Let's debug this",
        "Merge time?",
        "What's the PR?",
        "Tests passing?",
        "Ship ship ship"
    ]

    @State private var chatGreeting: String = Self.chatGreetings.randomElement() ?? "How can I help?"
    @State private var codeGreeting: String = Self.codeGreetings.randomElement() ?? "What are we building?"

    private var greeting: String {
        mode == .chat ? chatGreeting : codeGreeting
    }

    // MARK: - Actions

    private func createSession() {
        let request: SessionCreationRequest

        if mode == .chat {
            if selectedEnvironment.isLocal {
                request = .localChat(initialPrompt: promptText.isEmpty ? nil : promptText)
            } else {
                request = .remoteChat(initialPrompt: promptText.isEmpty ? nil : promptText)
            }
        } else {
            if selectedEnvironment.isLocal {
                guard let path = selectedFolderPath else { return }
                request = .localCode(folderPath: path, initialPrompt: promptText.isEmpty ? nil : promptText)
            } else {
                guard let repo = selectedRepo,
                      let environment = selectedEnvironment.relayEnvironment else { return }
                request = .remoteCode(
                    repo: repo,
                    environment: environment,
                    initialPrompt: promptText.isEmpty ? nil : promptText
                )
            }
        }

        onCreateSession(request)
    }

    // MARK: - Environment Loading

    private func loadEnvironments() async {
        guard serverConfig.isConfigured,
              let serverURL = serverConfig.serverURL else {
            return
        }

        guard !isLoadingEnvironments else { return }

        isLoadingEnvironments = true
        environmentError = nil

        do {
            let connection = ensureTempConnection(serverURL: serverURL)

            if !connection.isServerReachable {
                try await connection.checkHealth()
            }

            environments = try await connection.listEnvironments()
            environmentError = nil
        } catch {
            environmentError = error.localizedDescription
            environments = []
        }

        isLoadingEnvironments = false
    }

    // MARK: - Repo Loading

    private func loadRepos() async {
        guard serverConfig.isConfigured,
              let serverURL = serverConfig.serverURL else {
            return
        }

        guard !isLoadingRepos else { return }

        isLoadingRepos = true
        repoError = nil

        do {
            let connection = ensureTempConnection(serverURL: serverURL)

            if !connection.isServerReachable {
                try await connection.checkHealth()
            }

            repos = try await connection.listRepos()
            repoError = nil
        } catch {
            repoError = error.localizedDescription
            repos = []
        }

        isLoadingRepos = false
    }

    // MARK: - Helpers

    private func ensureTempConnection(serverURL: URL) -> ServerConnection {
        if let existing = tempConnection {
            return existing
        }
        let connection = ServerConnection(serverURL: serverURL)
        tempConnection = connection
        return connection
    }
}

// MARK: - Preview

#Preview("Chat Mode") {
    WelcomeView(mode: .chat) { _ in }
        .frame(width: 600, height: 500)
}

#Preview("Code Mode") {
    WelcomeView(mode: .code) { _ in }
        .frame(width: 600, height: 500)
}
