//
//  WelcomeView.swift
//  pi
//
//  Empty state view when no session is selected, with environment picker
//

import SwiftUI
import PiUI

/// Environment selection for session creation
enum SessionEnvironment: String, CaseIterable, Identifiable {
    case local = "Local"
    case remote = "Remote"

    var id: String { rawValue }
}

struct WelcomeView: View {
    let mode: SidebarMode
    let onNewChat: () -> Void
    let onNewCodeSession: () -> Void
    let onNewRemoteChat: () -> Void
    let onNewRemoteCodeSession: (RepoInfo) -> Void

    @State private var serverConfig = ServerConfig.shared
    @State private var selectedEnvironment: SessionEnvironment = .local

    // Remote state
    @State private var repos: [RepoInfo] = []
    @State private var isLoadingRepos = false
    @State private var repoError: String?
    @State private var tempConnection: ServerConnection?

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon and title
            VStack(spacing: 16) {
                Image(systemName: mode == .chat ? "bubble.left.and.bubble.right" : "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)

                Text(mode == .chat ? "Start a Conversation" : "Start Coding")
                    .font(.title)
                    .fontWeight(.semibold)

                Text(environmentDescription)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            // Environment picker
            HStack(spacing: 12) {
                environmentPicker
            }
            .padding(.horizontal, 40)

            // Content area based on environment
            if selectedEnvironment == .local {
                localContent
            } else {
                remoteContent
            }

            Spacer()

            keyboardHint
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onChange(of: selectedEnvironment) { _, newValue in
            if newValue == .remote {
                Task { await loadRepos() }
            }
        }
    }

    // MARK: - Environment Description

    private var environmentDescription: String {
        if selectedEnvironment == .local {
            return mode == .chat
                ? "Chat with Pi about anything"
                : "Open a local project folder to work with Pi"
        }
        return mode == .chat
            ? "Chat with Pi on a remote server"
            : "Select a GitHub repository from the server"
    }

    // MARK: - Environment Picker

    @ViewBuilder
    private var environmentPicker: some View {
        Menu {
            ForEach(SessionEnvironment.allCases) { env in
                Button {
                    selectedEnvironment = env
                } label: {
                    HStack {
                        Label(env.rawValue, systemImage: env == .local ? "desktopcomputer" : "cloud")
                        if selectedEnvironment == env {
                            Spacer()
                            Image(systemName: "checkmark")
                        }
                    }
                }
                .disabled(env == .remote && !serverConfig.isConfigured)
            }
        } label: {
            HStack {
                Image(systemName: selectedEnvironment == .local ? "desktopcomputer" : "cloud")
                Text(selectedEnvironment.rawValue)
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
        }
        .menuStyle(.borderlessButton)
        .frame(width: 160)
        .help(serverConfig.isConfigured ? "Select environment" : "Configure server in Settings to enable Remote")
    }

    // MARK: - Local Content

    @ViewBuilder
    private var localContent: some View {
        Button {
            if mode == .chat {
                onNewChat()
            } else {
                onNewCodeSession()
            }
        } label: {
            Label(
                mode == .chat ? "New Chat" : "Open Project",
                systemImage: mode == .chat ? "plus.bubble" : "folder.badge.plus"
            )
            .frame(minWidth: 120)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }

    // MARK: - Remote Content

    @ViewBuilder
    private var remoteContent: some View {
        if !serverConfig.isConfigured {
            VStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .font(.title)
                    .foregroundStyle(.secondary)
                Text("Server not configured")
                    .font(.headline)
                Text("Configure a server URL in Settings to use remote mode")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
        } else if mode == .chat {
            // Remote chat - just a button
            Button {
                onNewRemoteChat()
            } label: {
                Label("New Remote Chat", systemImage: "plus.bubble")
                    .frame(minWidth: 120)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        } else {
            // Remote code - show repo picker
            VStack(spacing: 16) {
                Text("Select a repository")
                    .font(.headline)

                RepoPickerView(
                    repos: repos,
                    recentRepoIds: serverConfig.recentRepoIds,
                    isLoading: isLoadingRepos,
                    error: repoError,
                    onSelect: { repo in
                        onNewRemoteCodeSession(repo)
                    },
                    onRefresh: {
                        Task { await loadRepos() }
                    }
                )
                .frame(width: 350, height: 300)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(8)
            }
        }
    }

    // MARK: - Keyboard Hint

    @ViewBuilder
    private var keyboardHint: some View {
        if selectedEnvironment == .local {
            Text(mode == .chat
                ? "Press Cmd+N to start a new chat"
                : "Press Cmd+Shift+N to open a project")
                .font(.caption)
                .foregroundStyle(.tertiary)
        } else {
            Text("Select an environment and context above")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
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
    WelcomeView(
        mode: .chat,
        onNewChat: {},
        onNewCodeSession: {},
        onNewRemoteChat: {},
        onNewRemoteCodeSession: { _ in }
    )
    .frame(width: 600, height: 500)
}

#Preview("Code Mode - Local") {
    WelcomeView(
        mode: .code,
        onNewChat: {},
        onNewCodeSession: {},
        onNewRemoteChat: {},
        onNewRemoteCodeSession: { _ in }
    )
    .frame(width: 600, height: 500)
}
