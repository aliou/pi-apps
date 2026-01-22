//
//  AppSettings.swift
//  Pi
//
//  App-wide settings with persistence via UserDefaults
//

import Foundation
import SwiftUI
import UIKit
import PiCore
import PiUI

/// Observable app settings with automatic persistence
@MainActor
@Observable
public final class AppSettings {
    /// Shared singleton instance
    public static let shared = AppSettings()

    // MARK: - Chat Settings

    /// Custom system prompt for chat sessions (replaces default if non-empty)
    public var chatSystemPrompt: String {
        didSet {
            UserDefaults.standard.set(chatSystemPrompt, forKey: Keys.chatSystemPrompt)
        }
    }

    /// Default behavior when sending during streaming
    public var streamingBehavior: StreamingBehavior {
        didSet {
            UserDefaults.standard.set(streamingBehavior.rawValue, forKey: Keys.streamingBehavior)
        }
    }

    // MARK: - Initialization

    private enum Keys {
        static let chatSystemPrompt = "chatSystemPrompt"
        static let streamingBehavior = "streamingBehavior"
    }

    private init() {
        self.chatSystemPrompt = UserDefaults.standard.string(forKey: Keys.chatSystemPrompt)
            ?? Self.defaultChatSystemPrompt

        let storedBehavior = UserDefaults.standard.string(forKey: Keys.streamingBehavior)
        self.streamingBehavior = StreamingBehavior(rawValue: storedBehavior ?? StreamingBehavior.steer.rawValue)
            ?? .steer
    }

    // MARK: - Default Prompt

    /// Default conversational system prompt for chat mode
    public static let defaultChatSystemPrompt = """
        You are pi, a helpful and knowledgeable assistant. You help users by answering questions, \
        explaining concepts, brainstorming ideas, and having thoughtful conversations.

        Guidelines:
        - Be concise but thorough
        - Ask clarifying questions when the request is ambiguous
        - Admit when you don't know something
        - Use markdown formatting for better readability when appropriate
        - For code snippets, use fenced code blocks with language hints

        Keep responses focused and conversational. The user is on a mobile device, \
        so prefer shorter, scannable responses over long walls of text.

        When asked about yourself, where you're running, or your environment, \
        refer to the Client Context below - you're running on the user's mobile device via the Pi app.
        """

    // MARK: - Computed

    /// Returns the effective chat system prompt (trimmed, or nil if empty)
    public var effectiveChatSystemPrompt: String? {
        let base = chatSystemPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty else { return nil }
        return base
    }

    /// Reset to default prompt
    public func resetToDefault() {
        chatSystemPrompt = Self.defaultChatSystemPrompt
    }
}
