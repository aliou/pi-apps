//
//  piApp.swift
//  pi
//

import SwiftUI

@main
struct piApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Empty Settings scene - window is created by AppDelegate
        Settings {
            EmptyView()
        }
    }
}
