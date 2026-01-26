//
//  WelcomeView.swift
//  pi
//
//  Claude Desktop-style welcome view with dropdowns and input field
//

import SwiftUI
import PiUI

/// Environment selection for session creation
enum SessionEnvironment: String, CaseIterable, Identifiable, Sendable {
    case local = "Local"
    case remote = "Remote"

    var id: String { rawValue }
}

struct WelcomeView: View {
    let mode: SidebarMode
    let onCreateSession: (SessionCreationRequest) -> Void

    @State private var serverConfig = ServerConfig.shared
    @State private var selectedEnvironment: SessionEnvironment = .local

    // Context selection
    @State private var selectedFolderPath: String?
    @State private var selectedRepo: RepoInfo?

    // Input
    @State private var promptText = ""

    // Remote state
    @State private var repos: [RepoInfo] = []
    @State private var isLoadingRepos = false
    @State private var repoError: String?
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
                    .foregroundStyle(mode == .chat ? Theme.accent : Theme.accent)
                Text(greeting)
                    .font(.system(size: 28, weight: .regular))
                    .foregroundStyle(.primary)
            }

            if mode == .code {
                // Two dropdowns row - adjacent, centered, matching Claude proportions
                HStack(spacing: 12) {
                    // Left: Context picker (wider ~60%)
                    ContextPickerDropdown(
                        mode: mode,
                        environment: selectedEnvironment,
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

                    // Right: Environment picker (~40%)
                    EnvironmentPickerDropdown(
                        selectedEnvironment: $selectedEnvironment,
                        serverConfig: serverConfig
                    )
                    .frame(width: 220)
                }
            }

            // Input field (always visible)
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
        .onChange(of: selectedEnvironment) { _, newValue in
            // Clear selection when switching environments
            selectedFolderPath = nil
            selectedRepo = nil

            if newValue == .remote {
                Task { await loadRepos() }
            }
        }
    }

    // MARK: - Computed Properties

    private var canSubmit: Bool {
        // Always need some text
        guard !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        if mode == .chat {
            return true
        }

        // Code mode: also needs context selected
        if selectedEnvironment == .local {
            return selectedFolderPath != nil
        }

        return selectedRepo != nil
    }

    private var recentFolders: [String] {
        ServerConfig.shared.recentFolders
    }

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
            if selectedEnvironment == .local {
                request = .localChat(initialPrompt: promptText.isEmpty ? nil : promptText)
            } else {
                request = .remoteChat(initialPrompt: promptText.isEmpty ? nil : promptText)
            }
        } else {
            if selectedEnvironment == .local {
                guard let path = selectedFolderPath else { return }
                request = .localCode(folderPath: path, initialPrompt: promptText.isEmpty ? nil : promptText)
            } else {
                guard let repo = selectedRepo else { return }
                request = .remoteCode(repo: repo, initialPrompt: promptText.isEmpty ? nil : promptText)
            }
        }

        onCreateSession(request)
    }

    // MARK: - Repo Loading

    private func loadRepos() async {
        guard serverConfig.isConfigured,
              let serverURL = serverConfig.serverURL else {
            return
        }

        // Avoid multiple simultaneous loads
        guard !isLoadingRepos else { return }

        isLoadingRepos = true
        repoError = nil

        do {
            // Create temporary connection if needed
            if tempConnection == nil {
                tempConnection = ServerConnection(serverURL: serverURL)
            }

            guard let connection = tempConnection else {
                throw ServerConnectionError.notConnected
            }

            // Connect if not already connected
            if !connection.isConnected {
                try await connection.connect()
            }

            // Fetch repos
            repos = try await connection.listRepos()
            repoError = nil
        } catch {
            repoError = error.localizedDescription
            repos = []
        }

        isLoadingRepos = false
    }
}

// MARK: - Preview

#Preview("Chat Mode - Local") {
    WelcomeView(mode: .chat) { _ in }
        .frame(width: 600, height: 500)
}

#Preview("Code Mode - Local") {
    WelcomeView(mode: .code) { _ in }
        .frame(width: 600, height: 500)
}
