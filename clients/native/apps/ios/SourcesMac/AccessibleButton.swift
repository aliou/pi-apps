import SwiftUI
#if os(macOS)
import AppKit

/// A drop-in replacement for SwiftUI `Button` that properly exposes `AXPress`
/// to the macOS Accessibility API.
///
/// SwiftUI's `Button` on macOS does not expose `AXPress`, making it untappable
/// by accessibility-based automation tools (AXorcist, Accessibility Inspector).
/// This view uses a real `NSButton` via `NSViewRepresentable`.
///
/// Usage:
/// ```swift
/// AccessibleButton("New Chat", systemImage: "plus") {
///     createSession()
/// }
/// .accessibilityIdentifier("new-session-button")
/// ```
struct AccessibleButton: NSViewRepresentable {
    let title: String
    let systemImage: String?
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, systemImage: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.action = action
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }

    func makeNSView(context: Context) -> NSButton {
        let button: NSButton
        if let systemImage,
           let image = NSImage(systemSymbolName: systemImage, accessibilityDescription: title) {
            button = NSButton(
                title: title,
                image: image,
                target: context.coordinator,
                action: #selector(Coordinator.performAction)
            )
            button.imagePosition = .imageLeading
        } else {
            button = NSButton(title: title, target: context.coordinator, action: #selector(Coordinator.performAction))
        }

        button.bezelStyle = .toolbar
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setContentHuggingPriority(.defaultHigh, for: .vertical)
        button.setContentHuggingPriority(.defaultHigh, for: .horizontal)
        button.setAccessibilityLabel(title)

        return button
    }

    func updateNSView(_ nsView: NSButton, context: Context) {
        nsView.title = title
        nsView.setAccessibilityLabel(title)
        nsView.isEnabled = isEnabled
        context.coordinator.action = action

        if let systemImage {
            nsView.image = NSImage(systemSymbolName: systemImage, accessibilityDescription: title)
        }
    }

    final class Coordinator: NSObject {
        var action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
        }

        @objc func performAction() {
            action()
        }
    }
}
#endif
