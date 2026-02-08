//
//  StyledDropdown.swift
//  PiUI
//
//  Floating dropdown using NSPanel for proper overlay behavior
//

#if os(macOS)
import SwiftUI
import AppKit

// MARK: - Floating Dropdown

/// A dropdown that opens as a floating panel below the button
public struct FloatingDropdown<Content: View>: View {
    public let icon: String
    public let title: String
    public let isPlaceholder: Bool
    @Binding public var isExpanded: Bool
    public let content: Content

    @State private var buttonFrame: CGRect = .zero

    public init(
        icon: String,
        title: String,
        isPlaceholder: Bool = false,
        isExpanded: Binding<Bool>,
        @ViewBuilder content: () -> Content
    ) {
        self.icon = icon
        self.title = title
        self.isPlaceholder = isPlaceholder
        self._isExpanded = isExpanded
        self.content = content()
    }

    public var body: some View {
        Button {
            if isExpanded {
                DropdownPanelController.shared.hide()
                isExpanded = false
            } else {
                isExpanded = true
                DropdownPanelController.shared.show(
                    content: AnyView(
                        VStack(spacing: 0) {
                            content
                        }
                        .background(Color(nsColor: .controlBackgroundColor))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                        )
                        .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 4)
                    ),
                    anchorFrame: buttonFrame
                ) {
                    isExpanded = false
                }
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .foregroundStyle(.secondary)

                Text(title)
                    .foregroundStyle(isPlaceholder ? .secondary : .primary)
                    .lineLimit(1)

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(isExpanded ? -180 : 0))
                    .animation(.easeInOut(duration: 0.2), value: isExpanded)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .background(
            GeometryReader { geo in
                Color.clear
                    .onAppear {
                        updateFrame(geo)
                    }
                    .onChange(of: geo.frame(in: .global)) { _, _ in
                        updateFrame(geo)
                    }
            }
        )
        .onChange(of: isExpanded) { _, newValue in
            if !newValue {
                DropdownPanelController.shared.hide()
            }
        }
    }

    private func updateFrame(_ geo: GeometryProxy) {
        buttonFrame = geo.frame(in: .global)
    }
}

// MARK: - NSPanel Controller

@MainActor
public final class DropdownPanelController {
    public static let shared = DropdownPanelController()

    private var panel: NSPanel?
    private var hostingView: NSHostingView<AnyView>?
    private var onDismiss: (() -> Void)?
    private var clickMonitor: Any?
    private var appDeactivateMonitor: Any?

    private init() {}

    public func show(content: AnyView, anchorFrame: CGRect, onDismiss: @escaping () -> Void) {
        hide()

        self.onDismiss = onDismiss

        // Get the key window to convert coordinates
        guard let window = NSApp.keyWindow ?? NSApp.mainWindow else { return }

        // Convert SwiftUI global coordinates to window coordinates, then to screen
        // SwiftUI global frame is in window coordinates with flipped Y (top = 0)
        // We need to convert to screen coordinates (bottom-left origin)
        let windowFrame = window.frame
        let contentLayoutRect = window.contentLayoutRect

        // anchorFrame is in SwiftUI coordinates (origin top-left of window content)
        // Convert to screen coordinates
        let screenX = windowFrame.minX + anchorFrame.minX
        let screenY = windowFrame.maxY - contentLayoutRect.height + anchorFrame.minY

        let (panel, hostingView) = createPanel(
            anchorFrame: anchorFrame,
            contentSize: CGSize(width: screenX, height: screenY),
            content: content
        )

        self.panel = panel
        self.hostingView = hostingView

        // Monitor for clicks outside
        clickMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]
        ) { [weak self] event in
            guard let self, let panel = self.panel else { return event }

            if event.window != panel {
                // Clicked outside panel - call dismiss before hide (hide clears onDismiss)
                let callback = self.onDismiss
                self.hide()
                callback?()
            }
            return event
        }

        // Monitor for app deactivation
        appDeactivateMonitor = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            let callback = self?.onDismiss
            self?.hide()
            callback?()
        }
    }

    private func createPanel(
        anchorFrame: CGRect,
        contentSize: CGSize,
        content: AnyView
    ) -> (NSPanel, NSHostingView<AnyView>) {
        let screenX = contentSize.width
        let screenY = contentSize.height

        // Create panel
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: anchorFrame.width, height: 300),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false // We handle shadow in SwiftUI

        // Create hosting view
        let hostingView = NSHostingView(rootView: content)
        hostingView.frame = panel.contentView?.bounds ?? .zero
        hostingView.autoresizingMask = [.width, .height]
        panel.contentView?.addSubview(hostingView)

        // Size to fit content
        let fittingSize = hostingView.fittingSize
        let finalWidth = max(anchorFrame.width, fittingSize.width)
        let finalHeight = min(fittingSize.height, 400) // Max height

        // Position below the button (screenY is top of button, subtract button height and panel height)
        let panelY = screenY - anchorFrame.height - finalHeight - 4 // 4px gap

        panel.setFrame(
            NSRect(x: screenX, y: panelY, width: finalWidth, height: finalHeight),
            display: true
        )

        panel.orderFront(nil)

        return (panel, hostingView)
    }

    public func hide() {
        if let monitor = clickMonitor {
            NSEvent.removeMonitor(monitor)
            clickMonitor = nil
        }
        if let monitor = appDeactivateMonitor {
            NotificationCenter.default.removeObserver(monitor)
            appDeactivateMonitor = nil
        }
        panel?.orderOut(nil)
        panel = nil
        hostingView = nil
        onDismiss = nil
    }
}

// MARK: - Dropdown Section

public struct DropdownSection<Content: View>: View {
    public let title: String?
    @ViewBuilder public let content: () -> Content

    public init(_ title: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let title {
                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.top, 10)
                    .padding(.bottom, 6)
            }

            content()
        }
    }
}

// MARK: - Dropdown Row

public struct DropdownRow: View {
    public let title: String
    public let subtitle: String?
    public let icon: String?
    public let isSelected: Bool
    public let action: () -> Void

    @State private var isHovered = false

    public init(
        _ title: String,
        subtitle: String? = nil,
        icon: String? = nil,
        isSelected: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.isSelected = isSelected
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if let icon {
                    Image(systemName: icon)
                        .frame(width: 20)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    if let subtitle {
                        Text(subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption)
                        .foregroundStyle(.tint)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isHovered ? Color(nsColor: .controlColor) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

// MARK: - Dropdown Divider

public struct DropdownDivider: View {
    public var body: some View {
        Divider()
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
    }
}

// MARK: - Dropdown Footer

public struct DropdownFooter: View {
    public let text: String
    public let buttonTitle: String?
    public let buttonIcon: String?
    public let action: (() -> Void)?

    public init(_ text: String, buttonTitle: String? = nil, buttonIcon: String? = nil, action: (() -> Void)? = nil) {
        self.text = text
        self.buttonTitle = buttonTitle
        self.buttonIcon = buttonIcon
        self.action = action
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
                .padding(.horizontal, 10)

            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 14)

            if let buttonTitle, let action {
                Button(action: action) {
                    HStack(spacing: 6) {
                        if let buttonIcon {
                            Image(systemName: buttonIcon)
                        }
                        Text(buttonTitle)
                    }
                    .font(.caption)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 14)
            }
        }
        .padding(.bottom, 10)
    }
}

#endif
