import SwiftUI
import simd

// MARK: - Cross-platform color abstraction replacing Jules' AppColors

#if os(macOS)
import AppKit
public typealias PlatformColor = NSColor
#else
import UIKit
public typealias PlatformColor = UIColor
#endif

extension PlatformColor {
    var simd4: SIMD4<Float> {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        #if os(macOS)
        guard let components = self.usingColorSpace(.sRGB) else {
            return SIMD4<Float>(0.5, 0.5, 0.5, 1.0)
        }
        components.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        #else
        getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        #endif
        return SIMD4<Float>(Float(red), Float(green), Float(blue), Float(alpha))
    }
}

// MARK: - Theme colors for diff rendering

@MainActor
enum DiffColors {
    // Diff editor colors
    static let addedBg = PlatformColor(red: 0.18, green: 0.35, blue: 0.18, alpha: 1.0)
    static let removedBg = PlatformColor(red: 0.40, green: 0.15, blue: 0.15, alpha: 1.0)
    static let text = PlatformColor(red: 0.85, green: 0.85, blue: 0.85, alpha: 1.0)
    static let gutterText = PlatformColor(red: 0.50, green: 0.50, blue: 0.50, alpha: 1.0)
    static let highlight = PlatformColor(red: 0.30, green: 0.50, blue: 0.30, alpha: 0.5)
    static let fold = PlatformColor(red: 0.20, green: 0.20, blue: 0.25, alpha: 1.0)
    static let selection = PlatformColor(red: 0.25, green: 0.40, blue: 0.60, alpha: 0.5)
    static let fileHeaderBg = PlatformColor(red: 0.15, green: 0.15, blue: 0.20, alpha: 1.0)
    static let fileHeaderText = PlatformColor(red: 0.80, green: 0.80, blue: 0.85, alpha: 1.0)
    static let modifiedIndicator = PlatformColor(red: 0.90, green: 0.70, blue: 0.20, alpha: 1.0)
    static let addedText = PlatformColor(red: 0.40, green: 0.80, blue: 0.40, alpha: 1.0)
    static let removedText = PlatformColor(red: 0.90, green: 0.40, blue: 0.40, alpha: 1.0)
    static let gutterSeparator = PlatformColor(red: 0.25, green: 0.25, blue: 0.28, alpha: 1.0)
    static let background = PlatformColor(red: 0.11, green: 0.11, blue: 0.13, alpha: 1.0)

    // Syntax colors
    static let syntaxComment = PlatformColor(red: 0.45, green: 0.50, blue: 0.55, alpha: 1.0)
    static let syntaxKeyword = PlatformColor(red: 0.80, green: 0.50, blue: 0.80, alpha: 1.0)
    static let syntaxString = PlatformColor(red: 0.60, green: 0.80, blue: 0.50, alpha: 1.0)
    static let syntaxNumber = PlatformColor(red: 0.85, green: 0.65, blue: 0.40, alpha: 1.0)
    static let syntaxType = PlatformColor(red: 0.50, green: 0.75, blue: 0.85, alpha: 1.0)
    static let syntaxFunction = PlatformColor(red: 0.70, green: 0.70, blue: 0.90, alpha: 1.0)
    static let syntaxVariable = PlatformColor(red: 0.75, green: 0.75, blue: 0.80, alpha: 1.0)
    static let syntaxOperator = PlatformColor(red: 0.80, green: 0.50, blue: 0.80, alpha: 1.0)
    static let syntaxTag = PlatformColor(red: 0.80, green: 0.50, blue: 0.50, alpha: 1.0)
    static let syntaxRegexp = PlatformColor(red: 0.60, green: 0.80, blue: 0.50, alpha: 1.0)
    static let syntaxSpecial = PlatformColor(red: 0.85, green: 0.65, blue: 0.40, alpha: 1.0)
}
