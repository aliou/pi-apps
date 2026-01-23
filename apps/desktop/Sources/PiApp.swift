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

            CommandMenu("Debug") {
                Button("Toggle Debug Panel") {
                    NotificationCenter.default.post(name: .toggleDebugPanel, object: nil)
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])
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
    static let toggleDebugPanel = Notification.Name("toggleDebugPanel")
}

// MARK: - Focused Scene Values

struct DebugPanelVisibleKey: FocusedValueKey {
    typealias Value = Binding<Bool>
}

extension FocusedValues {
    var debugPanelVisible: Binding<Bool>? {
        get { self[DebugPanelVisibleKey.self] }
        set { self[DebugPanelVisibleKey.self] = newValue }
    }
}
