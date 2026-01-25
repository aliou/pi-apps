//
//  SessionCreationRequest.swift
//  pi
//
//  Request types for session creation from WelcomeView
//

import Foundation

/// Session creation request with all context needed
enum SessionCreationRequest: Sendable {
    case localChat(initialPrompt: String?)
    case localCode(folderPath: String, initialPrompt: String?)
    case remoteChat(initialPrompt: String?)
    case remoteCode(repo: RepoInfo, initialPrompt: String?)
}
