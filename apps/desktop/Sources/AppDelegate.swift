//
//  AppDelegate.swift
//  pi
//

import AppKit
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Create window with Ghostty-style "tabs" titlebar
        let styleMask: NSWindow.StyleMask = [
            .titled,
            .closable,
            .miniaturizable,
            .resizable,
            .fullSizeContentView
        ]

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 750),
            styleMask: styleMask,
            backing: .buffered,
            defer: false
        )

        // Configure transparent titlebar
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = ""
        window.isMovableByWindowBackground = true
        window.toolbar = nil
        window.backgroundColor = NSColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1.0)

        // Host SwiftUI content
        window.contentView = NSHostingView(rootView: MainView())

        // Show window
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
