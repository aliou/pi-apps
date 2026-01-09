//
//  Session.swift
//  pi
//
//  Session model and persistence
//

import Foundation
import Combine

// MARK: - Session

struct Session: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    var title: String
    
    /// The original path selected by the user (may be subdirectory of repo)
    let selectedPath: String
    
    /// Root of the Git repository
    let repoRoot: String
    
    /// Relative path from repo root to the selected directory (empty if repo root was selected)
    let relativePath: String
    
    /// Name of the worktree directory (stored in data/worktrees/)
    let worktreeName: String
    
    /// Path to pi's session file (.jsonl) - set after first prompt
    var piSessionFile: String?
    
    let createdAt: Date
    var updatedAt: Date
    
    /// Full path to the worktree
    var worktreePath: String {
        AppPaths.worktreesPath + "/\(worktreeName)"
    }
    
    /// Working directory within the worktree (where pi should run)
    var workingDirectory: String {
        if relativePath.isEmpty {
            return worktreePath
        } else {
            return worktreePath + "/\(relativePath)"
        }
    }
    
    /// Display name for the project (last component of repo)
    var projectName: String {
        URL(fileURLWithPath: repoRoot).lastPathComponent
    }
    
    init(
        id: UUID = UUID(),
        title: String = "New Session",
        selectedPath: String,
        repoRoot: String,
        relativePath: String,
        worktreeName: String,
        piSessionFile: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.selectedPath = selectedPath
        self.repoRoot = repoRoot
        self.relativePath = relativePath
        self.worktreeName = worktreeName
        self.piSessionFile = piSessionFile
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// AppPaths is now in Services/AppPaths.swift

// MARK: - SessionStore

@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var sessions: [Session] = []
    
    private var indexPath: String {
        AppPaths.sessionsPath + "/index.json"
    }
    
    private let fileManager = FileManager.default
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    
    init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        
        ensureDirectoryStructure()
        loadSessions()
    }
    
    // MARK: - Public Methods
    
    /// Create a new session from a selected folder path
    /// - Parameter selectedPath: The path the user selected (must be inside a Git repo)
    /// - Returns: The created session
    func createSession(selectedPath: String) throws -> Session {
        // Find the Git repo root
        guard let repoRoot = GitService.findRepoRoot(for: selectedPath) else {
            throw GitError.notAGitRepository
        }
        
        // Calculate relative path from repo root to selected path
        let relativePath: String
        if selectedPath == repoRoot {
            relativePath = ""
        } else {
            var rel = selectedPath
            if rel.hasPrefix(repoRoot) {
                rel = String(rel.dropFirst(repoRoot.count))
            }
            if rel.hasPrefix("/") {
                rel = String(rel.dropFirst())
            }
            relativePath = rel
        }
        
        // Generate worktree name and path
        let worktreeName = GitService.generateWorktreeName()
        let worktreePath = AppPaths.worktreesPath + "/\(worktreeName)"
        
        // Create the worktree
        _ = try GitService.createWorktree(from: repoRoot, to: worktreePath)
        
        // Create session (piSessionFile will be set after first prompt)
        let session = Session(
            selectedPath: selectedPath,
            repoRoot: repoRoot,
            relativePath: relativePath,
            worktreeName: worktreeName
        )
        
        sessions.insert(session, at: 0)
        saveSessions()
        
        return session
    }
    
    func deleteSession(_ session: Session, deleteWorktree: Bool = false) {
        if deleteWorktree {
            try? GitService.removeWorktree(at: session.worktreePath, from: session.repoRoot)
        }
        sessions.removeAll { $0.id == session.id }
        saveSessions()
    }
    
    func updateTitle(for sessionId: UUID, title: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        
        sessions[index].title = title
        sessions[index].updatedAt = Date()
        sortSessions()
        saveSessions()
    }
    
    func updatePiSessionFile(for sessionId: UUID, piSessionFile: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        
        sessions[index].piSessionFile = piSessionFile
        saveSessions()
    }
    
    func touchSession(_ sessionId: UUID) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        
        sessions[index].updatedAt = Date()
        sortSessions()
        saveSessions()
    }
    
    // MARK: - Private Methods
    
    private func ensureDirectoryStructure() {
        try? fileManager.createDirectory(atPath: AppPaths.sessionsPath, withIntermediateDirectories: true)
        try? fileManager.createDirectory(atPath: AppPaths.worktreesPath, withIntermediateDirectories: true)
        try? fileManager.createDirectory(atPath: AppPaths.agentPath, withIntermediateDirectories: true)
    }
    
    private func loadSessions() {
        guard fileManager.fileExists(atPath: indexPath),
              let data = fileManager.contents(atPath: indexPath) else {
            sessions = []
            return
        }
        
        do {
            sessions = try decoder.decode([Session].self, from: data)
            sortSessions()
        } catch {
            print("Failed to load sessions: \(error)")
            sessions = []
        }
    }
    
    private func saveSessions() {
        do {
            let data = try encoder.encode(sessions)
            fileManager.createFile(atPath: indexPath, contents: data)
        } catch {
            print("Failed to save sessions: \(error)")
        }
    }
    
    private func sortSessions() {
        sessions.sort { $0.updatedAt > $1.updatedAt }
    }
}
