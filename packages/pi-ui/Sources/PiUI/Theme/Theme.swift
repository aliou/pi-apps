//
//  Theme.swift
//  PiUI
//
//  Simplified color palette for iOS 26 / macOS 26
//  Uses system semantics where possible, with minimal custom colors
//

import SwiftUI
@_exported import enum PiCore.ToolCallStatus

public enum Theme {
    // MARK: - Brand Accent

    public static let accent = Color.teal

    // MARK: - Semantic Status Colors

    public static let success = Color.green
    public static let error = Color.red
    public static let warning = Color.yellow
    public static let muted = Color.secondary

    // MARK: - Message Bubble Tints (for glass effects)

    public static let userMessageTint = Color.blue
    public static let queuedUserMessageTint = Color.gray
    public static let assistantMessageTint = Color.clear  // Pure glass, no tint

    // MARK: - Tool Status

    public static func toolStatusTint(_ status: ToolCallStatus) -> Color {
        switch status {
        case .running: return .yellow.opacity(0.3)
        case .success: return .green.opacity(0.3)
        case .error: return .red.opacity(0.3)
        }
    }

    public static func toolStatusColor(_ status: ToolCallStatus) -> Color {
        switch status {
        case .running: return warning
        case .success: return success
        case .error: return error
        }
    }

    // MARK: - Legacy Colors (for gradual migration)
    // These will be removed once all views migrate to system colors

    public static let text = Color.primary
    public static let textSecondary = Color.secondary
    public static let textMuted = Color.secondary.opacity(0.7)
    public static let dim = Color.secondary.opacity(0.6)
    public static let darkGray = Color.secondary.opacity(0.4)

    public static let pageBg = Color(light: rgb(0.972, 0.972, 0.972), dark: rgb(0.094, 0.094, 0.117))
    public static let cardBg = Color(light: rgb(1.000, 1.000, 1.000), dark: rgb(0.117, 0.117, 0.141))
    public static let sidebarBg = Color(light: rgb(0.941, 0.941, 0.941), dark: rgb(0.117, 0.117, 0.141))
    public static let inputBg = Color(light: rgb(1.000, 1.000, 1.000), dark: rgb(0.117, 0.117, 0.141))
    public static let selectedBg = Color(light: rgb(0.815, 0.815, 0.878), dark: rgb(0.227, 0.227, 0.290))
    public static let hoverBg = Color(light: rgb(0.878, 0.878, 0.909), dark: rgb(0.164, 0.164, 0.203))

    public static let userMessageBg = Color(light: rgb(0.909, 0.909, 0.909), dark: rgb(0.203, 0.207, 0.254))
    public static let queuedUserMessageBg = Color(light: rgb(0.925, 0.925, 0.925), dark: rgb(0.180, 0.180, 0.200))
    public static let toolPendingBg = Color(light: rgb(0.909, 0.909, 0.941), dark: rgb(0.156, 0.156, 0.196))
    public static let toolSuccessBg = Color(light: rgb(0.909, 0.941, 0.909), dark: rgb(0.156, 0.196, 0.156))
    public static let toolErrorBg = Color(light: rgb(0.941, 0.909, 0.909), dark: rgb(0.235, 0.156, 0.156))

    public static func toolStatusBg(_ status: ToolCallStatus) -> Color {
        switch status {
        case .running: return toolPendingBg
        case .success: return toolSuccessBg
        case .error: return toolErrorBg
        }
    }

    public static let border = Color(light: rgb(0.372, 0.529, 0.686), dark: rgb(0.372, 0.529, 1.000))
    public static let borderAccent = Color(light: rgb(0.372, 0.529, 0.529), dark: rgb(0, 0.843, 1.000))
    public static let borderMuted = Color(light: rgb(0.690, 0.690, 0.690), dark: rgb(0.313, 0.313, 0.313))

    // MARK: - Markdown Colors

    public static let mdHeading = Color(light: rgb(0.843, 0.686, 0.372), dark: rgb(0.941, 0.776, 0.454))
    public static let mdLink = Color(light: rgb(0.372, 0.529, 0.686), dark: rgb(0.505, 0.635, 0.745))
    public static let mdCode = Color(light: rgb(0.372, 0.529, 0.529), dark: rgb(0.541, 0.745, 0.717))
    public static let mdCodeBlock = Color(light: rgb(0.529, 0.686, 0.529), dark: rgb(0.709, 0.741, 0.407))
    public static let mdCodeBlockBg = Color(light: rgb(0.941, 0.941, 0.941), dark: rgb(0.101, 0.101, 0.125))
    public static let mdQuote = Color(light: rgb(0.423, 0.423, 0.423), dark: rgb(0.501, 0.501, 0.501))
    public static let mdQuoteBorder = Color(light: rgb(0.690, 0.690, 0.690), dark: rgb(0.313, 0.313, 0.313))

    // MARK: - Tool Diff Colors

    public static let diffAdded = success
    public static let diffRemoved = error
    public static let diffContext = muted

    // MARK: - Helpers

    private static func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
        Color(.sRGB, red: r, green: g, blue: b, opacity: 1.0)
    }
}

// MARK: - Color Extension for Light/Dark

extension Color {
    /// Creates a color that adapts to light and dark appearance
    public init(light: Color, dark: Color) {
        #if os(macOS)
        self.init(nsColor: NSColor(name: nil) { appearance in
            switch appearance.bestMatch(from: [.aqua, .darkAqua]) {
            case .darkAqua:
                return NSColor(dark)
            default:
                return NSColor(light)
            }
        })
        #else
        self.init(uiColor: UIColor { traits in
            switch traits.userInterfaceStyle {
            case .dark:
                return UIColor(dark)
            default:
                return UIColor(light)
            }
        })
        #endif
    }
}
