//
//  GitService.swift
//  pi
//
//  Git operations for worktree management
//

import Foundation

enum GitError: Error, LocalizedError {
    case notAGitRepository
    case worktreeCreationFailed(String)
    case commandFailed(String)
    
    var errorDescription: String? {
        switch self {
        case .notAGitRepository:
            return "Selected folder is not inside a Git repository"
        case .worktreeCreationFailed(let message):
            return "Failed to create worktree: \(message)"
        case .commandFailed(let message):
            return "Git command failed: \(message)"
        }
    }
}

struct GitService {
    
    /// Find the root of the Git repository containing the given path
    /// Returns nil if the path is not inside a Git repository
    static func findRepoRoot(for path: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["rev-parse", "--show-toplevel"]
        process.currentDirectoryPath = path
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        
        do {
            try process.run()
            process.waitUntilExit()
            
            guard process.terminationStatus == 0 else {
                return nil
            }
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8) else {
                return nil
            }
            
            return output.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }
    
    /// Get the current branch name
    static func getCurrentBranch(in repoPath: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["rev-parse", "--abbrev-ref", "HEAD"]
        process.currentDirectoryPath = repoPath
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        
        do {
            try process.run()
            process.waitUntilExit()
            
            guard process.terminationStatus == 0 else {
                return nil
            }
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8) else {
                return nil
            }
            
            return output.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }
    
    /// Get the current commit SHA
    static func getCurrentCommit(in repoPath: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["rev-parse", "HEAD"]
        process.currentDirectoryPath = repoPath
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        
        do {
            try process.run()
            process.waitUntilExit()
            
            guard process.terminationStatus == 0 else {
                return nil
            }
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let output = String(data: data, encoding: .utf8) else {
                return nil
            }
            
            return output.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil
        }
    }
    
    /// Create a new worktree from the given repository
    /// - Parameters:
    ///   - repoPath: Path to the Git repository
    ///   - worktreePath: Path where the worktree should be created
    ///   - branch: Optional branch name (creates new branch if provided, otherwise detached HEAD)
    /// - Returns: The path to the created worktree
    static func createWorktree(
        from repoPath: String,
        to worktreePath: String,
        branch: String? = nil
    ) throws -> String {
        let fileManager = FileManager.default
        
        // Ensure parent directory exists
        let parentDir = (worktreePath as NSString).deletingLastPathComponent
        try fileManager.createDirectory(atPath: parentDir, withIntermediateDirectories: true)
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.currentDirectoryPath = repoPath
        
        if let branch = branch {
            // Create worktree with new branch
            process.arguments = ["worktree", "add", "-b", branch, worktreePath]
        } else {
            // Create worktree at current HEAD (detached)
            process.arguments = ["worktree", "add", "--detach", worktreePath]
        }
        
        let errorPipe = Pipe()
        process.standardOutput = FileHandle.nullDevice
        process.standardError = errorPipe
        
        try process.run()
        process.waitUntilExit()
        
        guard process.terminationStatus == 0 else {
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
            let errorMessage = String(data: errorData, encoding: .utf8) ?? "Unknown error"
            throw GitError.worktreeCreationFailed(errorMessage)
        }
        
        return worktreePath
    }
    
    /// Remove a worktree
    static func removeWorktree(at worktreePath: String, from repoPath: String) throws {
        // First, remove the worktree directory
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: worktreePath) {
            try fileManager.removeItem(atPath: worktreePath)
        }
        
        // Then prune worktree references
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["worktree", "prune"]
        process.currentDirectoryPath = repoPath
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        
        try process.run()
        process.waitUntilExit()
    }
    
    /// Generate a random worktree name
    static func generateWorktreeName() -> String {
        let chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        let randomPart = String((0..<8).map { _ in chars.randomElement()! })
        return "wt-\(randomPart)"
    }
}
