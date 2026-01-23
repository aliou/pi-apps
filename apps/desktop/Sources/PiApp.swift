//
//  piApp.swift
//  pi
//

import SwiftUI

@main
struct piApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            MainView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Chat") {
                    NotificationCenter.default.post(name: .newChatSession, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)

                Button("New Code Session") {
                    NotificationCenter.default.post(name: .newCodeSession, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }

        Settings {
            SettingsView()
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let newChatSession = Notification.Name("newChatSession")
    static let newCodeSession = Notification.Name("newCodeSession")
}
