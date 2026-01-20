//
//  AppSettings.swift
//  Pi
//
//  App-wide settings with persistence via UserDefaults
//

import Foundation
import SwiftUI
import UIKit

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

    // MARK: - Initialization

    private enum Keys {
        static let chatSystemPrompt = "chatSystemPrompt"
    }

    private init() {
        self.chatSystemPrompt = UserDefaults.standard.string(forKey: Keys.chatSystemPrompt)
            ?? Self.defaultChatSystemPrompt
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

    // MARK: - Device Context

    /// Build device context string to append to system prompt
    public static func buildDeviceContext() -> String {
        let device = UIDevice.current
        let deviceModel = device.model // "iPhone", "iPad"
        let systemVersion = device.systemVersion
        let deviceName = device.name // User's device name like "John's iPhone"

        let isPhone = device.userInterfaceIdiom == .phone
        let deviceType = isPhone ? "mobile phone" : "tablet"

        return """

            ## Client Context
            You are running on the user's \(deviceType) via the Pi Mobile app.
            - Device: \(deviceModel) (\(deviceName))
            - OS: iOS \(systemVersion)
            - Connection: Pi Mobile app communicating with a pi server via WebSocket

            When asked where you're running or about your environment, mention you're on their \(deviceType) (\(deviceName)).
            Keep responses concise and easy to read on a \(isPhone ? "small" : "medium-sized") screen.
            """
    }

    // MARK: - Computed

    /// Returns the full system prompt with device context appended
    public var effectiveChatSystemPrompt: String? {
        let base = chatSystemPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty else { return nil }
        return base + Self.buildDeviceContext()
    }

    /// Reset to default prompt
    public func resetToDefault() {
        chatSystemPrompt = Self.defaultChatSystemPrompt
    }
}
