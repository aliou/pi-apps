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
    @State private var sessionManager = SessionManager()
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var sidebarMode: SidebarMode = .chat

    // Binary/update state
    @State private var binaryReady = false
    @State private var authReady = false
    @State private var updateAvailable: String?
    @State private var showUpdateSheet = false

    // Sheets
    @State private var showFolderPicker = false

    // Initial prompt for new sessions
    @State private var pendingPrompt: String?

    var body: some View {
        Group {
            if !binaryReady {
                SetupView {
                    binaryReady = true
                    checkAuth()
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
        .sheet(isPresented: .constant(!authReady && binaryReady)) {
            AuthSetupView {
                checkAuth()
            }
            .interactiveDismissDisabled()
        }
        .sheet(isPresented: $showFolderPicker) {
            FolderPickerView { folderPath in
                createCodeSession(folderPath: folderPath)
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
    }

    @ViewBuilder
    private var mainContent: some View {
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
            if let session = sessionManager.activeSession,
               let engine = sessionManager.activeEngine {
                SessionDetailView(
                    session: session,
                    engine: engine,
                    sessionManager: sessionManager
                )
            } else {
                WelcomeView(
                    mode: sidebarMode,
                    onNewChat: { createChatSession() },
                    onNewCodeSession: { showFolderPicker = true }
                )
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    // MARK: - Actions

    private func createChatSession() {
        Task {
            do {
                let session = try await sessionManager.createLocalChatSession()
                await sessionManager.selectSession(session.id)
            } catch {
                print("Failed to create chat session: \(error)")
            }
        }
    }

    private func createCodeSession(folderPath: String) {
        Task {
            do {
                let session = try await sessionManager.createLocalCodeSession(selectedPath: folderPath)
                await sessionManager.selectSession(session.id)
            } catch {
                print("Failed to create code session: \(error)")
            }
        }
    }

    // MARK: - Binary & Auth Checks

    private func checkBinaryAndUpdates() {
        binaryReady = AppPaths.piExecutableExists

        if binaryReady {
            checkAuth()

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

    private func checkAuth() {
        let agentPath = AppPaths.agentDirectory
        let authJson = agentPath.appendingPathComponent("auth.json")
        let modelsJson = agentPath.appendingPathComponent("models.json")

        let authExists = (try? FileManager.default.attributesOfItem(atPath: authJson.path)) != nil
        let modelsExists = (try? FileManager.default.attributesOfItem(atPath: modelsJson.path)) != nil

        authReady = authExists || modelsExists
    }
}

// MARK: - Preview

#Preview {
    MainView()
        .frame(width: 1000, height: 700)
}
