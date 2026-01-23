//
//  AppState.swift
//  pi
//
//  App-wide state management for setup and auth flow
//

import Foundation
import SwiftUI

/// App-wide state management
@MainActor
@Observable
final class AppState {
    /// Whether the pi binary is downloaded and ready
    private(set) var binaryReady: Bool = false

    /// Whether auth is configured (auth.json or models.json exists)
    private(set) var authReady: Bool = false

    /// Tracks if a reset is in progress
    private(set) var isResetting: Bool = false

    init() {
        checkState()
    }

    /// Shared instance for app-wide access
    static let shared = AppState()

    /// Check current state of binary and auth
    func checkState() {
        binaryReady = AppPaths.piExecutableExists

        if binaryReady {
            checkAuth()
        } else {
            authReady = false
        }
    }

    /// Mark binary as ready (called after successful download)
    func markBinaryReady() {
        binaryReady = true
        checkAuth()
    }

    /// Recheck auth status
    func checkAuth() {
        let agentPath = AppPaths.agentDirectory
        let authJson = agentPath.appendingPathComponent("auth.json")
        let modelsJson = agentPath.appendingPathComponent("models.json")

        let authExists = FileManager.default.fileExists(atPath: authJson.path)
        let modelsExists = FileManager.default.fileExists(atPath: modelsJson.path)

        authReady = authExists || modelsExists
    }

    /// Reset all app data and trigger setup flow
    func resetAllData() throws {
        isResetting = true

        // Delete Application Support directory
        let appSupport = AppPaths.applicationSupport
        try FileManager.default.removeItem(at: appSupport)

        // Reset state
        binaryReady = false
        authReady = false

        isResetting = false
    }
}

// MARK: - Environment Key

private struct AppStateKey: EnvironmentKey {
    static var defaultValue: AppState {
        MainActor.assumeIsolated { AppState.shared }
    }
}

extension EnvironmentValues {
    var appState: AppState {
        get { self[AppStateKey.self] }
        set { self[AppStateKey.self] = newValue }
    }
}
