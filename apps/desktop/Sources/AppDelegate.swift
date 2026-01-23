//
//  AppDelegate.swift
//  pi
//
//  App delegate configuring window for macOS 26 Liquid Glass
//

import AppKit
import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!

    func applicationDidFinishLaunching(_ notification: Notification) {
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

        // macOS 26 Liquid Glass configuration
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .visible
        window.toolbarStyle = .unified
        window.isMovableByWindowBackground = true

        // Let system handle background (enables glass effects)
        // Don't set custom backgroundColor

        window.contentView = NSHostingView(rootView: MainView())

        window.center()
        window.makeKeyAndOrderFront(nil)

        // Set minimum window size
        window.minSize = NSSize(width: 800, height: 500)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
