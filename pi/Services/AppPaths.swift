//
//  AppPaths.swift
//  pi
//
//  Centralized path management using Application Support
//

import Foundation

/// Manages all application paths using macOS best practices.
/// All data is stored in ~/Library/Application Support/me.aliou.pi-desktop/
enum AppPaths {
    
    /// Bundle identifier for the app
    static let bundleIdentifier = "me.aliou.pi-desktop"
    
    /// Base Application Support directory for the app.
    /// Creates the directory if it doesn't exist.
    static var applicationSupport: URL {
        let fm = FileManager.default
        guard let appSupport = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            fatalError("Could not find Application Support directory")
        }
        
        let appDir = appSupport.appendingPathComponent(bundleIdentifier)
        
        if !fm.fileExists(atPath: appDir.path) {
            try? fm.createDirectory(at: appDir, withIntermediateDirectories: true)
        }
        
        return appDir
    }
    
    /// Directory for the pi binary
    static var binDirectory: URL {
        let dir = applicationSupport.appendingPathComponent("bin")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    
    /// Path to the pi executable
    static var piExecutable: URL {
        binDirectory.appendingPathComponent("pi")
    }
    
    /// Path to the pi executable as a string (for Process)
    static var piExecutablePath: String {
        piExecutable.path
    }
    
    /// Directory for pi agent data (PI_AGENT_DIR)
    static var agentDirectory: URL {
        let dir = applicationSupport.appendingPathComponent("agent")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    
    /// Path to agent directory as string
    static var agentPath: String {
        agentDirectory.path
    }
    
    /// Directory for git worktrees
    static var worktreesDirectory: URL {
        let dir = applicationSupport.appendingPathComponent("worktrees")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    
    /// Path to worktrees directory as string
    static var worktreesPath: String {
        worktreesDirectory.path
    }
    
    /// Directory for session metadata
    static var sessionsDirectory: URL {
        let dir = applicationSupport.appendingPathComponent("sessions")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    
    /// Path to sessions directory as string
    static var sessionsPath: String {
        sessionsDirectory.path
    }
    
    /// Directory for logs
    static var logsDirectory: URL {
        let dir = applicationSupport.appendingPathComponent("logs")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
    
    /// Path to logs directory as string
    static var logsPath: String {
        logsDirectory.path
    }
    
    /// Version info file (stores current binary version and last update check)
    static var versionFile: URL {
        applicationSupport.appendingPathComponent("version.json")
    }
    
    /// Check if pi binary exists and is executable
    static var piExecutableExists: Bool {
        let fm = FileManager.default
        let path = piExecutable.path
        return fm.fileExists(atPath: path) && fm.isExecutableFile(atPath: path)
    }
    
    /// Ensures all required directories exist
    static func ensureDirectoryStructure() {
        _ = applicationSupport
        _ = binDirectory
        _ = agentDirectory
        _ = worktreesDirectory
        _ = sessionsDirectory
        _ = logsDirectory
    }
}
