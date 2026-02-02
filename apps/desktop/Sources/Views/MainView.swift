//
//  MainView.swift
//  pi
//
//  Main application view with NavigationSplitView
//

import SwiftUI
import PiCore
import PiUI

/// Sidebar mode selection
enum SidebarMode: String, CaseIterable, Identifiable {
    case chat = "Chat"
    case code = "Code"

    var id: String { rawValue }
}

struct MainView: View {
    @Environment(\.appState) private var appState
    @State private var sessionManager = SessionManager()
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var sidebarMode: SidebarMode = .chat

    // Binary/update state
    @State private var updateAvailable: String?
    @State private var showUpdateSheet = false

    // Sheets
    @State private var showFolderPicker = false
    @State private var showAuthSheet = false

    // Debug panel
    @State private var showDebugPanel = false
    @StateObject private var debugStore = DebugEventStore()

    // Initial prompt for new sessions
    @State private var pendingPrompt: String?

    var body: some View {
        Group {
            if !appState.binaryReady {
                SetupView {
                    appState.markBinaryReady()
                }
            } else {
                mainContent
            }
        }
        .onAppear {
            checkBinaryAndUpdates()
        }
        .sheet(isPresented: $showUpdateSheet) {
            UpdateSheet()
        }
        .sheet(isPresented: $showAuthSheet) {
            AuthSetupView {
                appState.checkAuth()
                showAuthSheet = false
            }
            .interactiveDismissDisabled()
        }
        .sheet(isPresented: $showFolderPicker) {
            FolderPickerView { folderPath in
                createCodeSession(folderPath: folderPath)
            }
        }
        .onChange(of: appState.authReady) { _, newValue in
            // Show sheet when auth is not ready (and binary is ready)
            showAuthSheet = !newValue && appState.binaryReady
        }
        .onChange(of: appState.binaryReady) { _, newValue in
            if newValue {
                // When binary becomes ready, check if we need to show auth sheet
                if !appState.authReady {
                    showAuthSheet = true
                }
            } else {
                // Reset session manager when binary is no longer ready (data was cleared)
                sessionManager.reset()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .newChatSession)) { _ in
            sidebarMode = .chat
            createChatSession()
        }
        .onReceive(NotificationCenter.default.publisher(for: .newCodeSession)) { _ in
            sidebarMode = .code
            showFolderPicker = true
        }
        .onAppear {
            // Pass debug store to session manager
            sessionManager.debugStore = debugStore
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        HStack(spacing: 0) {
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SessionSidebarView(
                    sessionManager: sessionManager,
                    sidebarMode: $sidebarMode,
                    onNewChat: { createChatSession() },
                    onNewCodeSession: { showFolderPicker = true },
                    onDeleteSession: { id, deleteWorktree in
                        Task { await sessionManager.deleteSession(id, deleteWorktree: deleteWorktree) }
                    }
                )
            } detail: {
                if let session = sessionManager.activeSession {
                    SessionDetailView(
                        session: session,
                        engine: sessionManager.activeEngine,
                        connectionState: sessionManager.activeConnectionState,
                        sessionManager: sessionManager
                    )
                } else {
                    WelcomeView(mode: sidebarMode) { request in
                        handleSessionCreation(request)
                    }
                }
            }
            .navigationSplitViewStyle(.balanced)

            // Debug panel (outside NavigationSplitView)
            if showDebugPanel {
                Divider()
                DebugPanelView(store: debugStore)
                    .frame(width: 320)
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    withAnimation { showDebugPanel.toggle() }
                } label: {
                    Image(systemName: "ladybug")
                }
                .help("Toggle Debug Panel")
            }
        }
        .focusedSceneValue(\.debugPanelVisible, $showDebugPanel)
        .onReceive(NotificationCenter.default.publisher(for: .toggleDebugPanel)) { _ in
            withAnimation { showDebugPanel.toggle() }
        }
    }

    // MARK: - Actions

    private func handleSessionCreation(_ request: SessionCreationRequest) {
        Task {
            do {
                let session: DesktopSession
                let initialPrompt: String?

                switch request {
                case .localChat(let prompt):
                    session = try await sessionManager.createLocalChatSession()
                    initialPrompt = prompt

                case .localCode(let folderPath, let prompt):
                    session = try await sessionManager.createLocalCodeSession(selectedPath: folderPath)
                    initialPrompt = prompt

                case .remoteChat(let prompt):
                    guard let serverURL = ServerConfig.shared.serverURL else { return }
                    session = try await sessionManager.createRemoteChatSession(serverURL: serverURL)
                    initialPrompt = prompt

                case .remoteCode(let repo, let environment, let prompt):
                    guard let serverURL = ServerConfig.shared.serverURL else { return }
                    ServerConfig.shared.addRecentRepo(String(repo.id))
                    session = try await sessionManager.createRemoteCodeSession(
                        serverURL: serverURL,
                        repoId: String(repo.id),
                        repoName: repo.name,
                        environmentId: environment.id,
                        environmentName: environment.name
                    )
                    initialPrompt = prompt
                }

                await sessionManager.selectSession(session.id)

                // Only send initial prompt if connection succeeded
                if sessionManager.activeConnectionState == .connected,
                   let prompt = initialPrompt,
                   !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    await sessionManager.sendInitialPrompt(for: session.id, prompt: prompt)
                }
            } catch {
                print("Failed to create session: \(error)")
            }
        }
    }

    private func createChatSession() {
        handleSessionCreation(.localChat(initialPrompt: nil))
    }

    private func createCodeSession(folderPath: String) {
        handleSessionCreation(.localCode(folderPath: folderPath, initialPrompt: nil))
    }

    // MARK: - Binary & Auth Checks

    private func checkBinaryAndUpdates() {
        appState.checkState()

        if appState.binaryReady {
            Task {
                let result = await BinaryUpdateService.shared.checkForUpdates()
                await MainActor.run {
                    if case .updateAvailable(let version) = result {
                        updateAvailable = version
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    MainView()
        .frame(width: 1000, height: 700)
}
