//
//  piApp.swift
//  pi
//

import SwiftUI

@main
struct piApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            SettingsView()
        }
    }
}
