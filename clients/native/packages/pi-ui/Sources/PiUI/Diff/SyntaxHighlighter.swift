import Foundation
import simd

#if os(macOS)
import SwiftTreeSitter
import CodeEditLanguages
#endif

/// Token with SIMD color for direct use in Metal rendering
struct SyntaxToken: Equatable {
    let range: NSRange
    let scope: String
    let color: SIMD4<Float>
}

@MainActor
final class SyntaxHighlighter {
    #if os(macOS)
    private let parser = Parser()
    private var queryCache: [String: Query] = [:]
    private var languageCache: [String: CodeLanguage] = [:]
    #endif

    // Syntax theme colors using DiffColors
    static let syntaxColors: [String: SIMD4<Float>] = [
        "keyword": SIMD4<Float>(0.839, 0.420, 0.663, 1.0),   // pink
        "string": SIMD4<Float>(0.584, 0.820, 0.455, 1.0),    // green
        "comment": SIMD4<Float>(0.443, 0.478, 0.537, 1.0),   // gray
        "function": SIMD4<Float>(0.408, 0.698, 0.937, 1.0),  // blue
        "type": SIMD4<Float>(0.455, 0.812, 0.808, 1.0),      // cyan
        "variable": SIMD4<Float>(0.800, 0.800, 0.800, 1.0),  // light gray
        "number": SIMD4<Float>(0.863, 0.631, 0.357, 1.0),    // orange
        "operator": SIMD4<Float>(0.839, 0.420, 0.663, 1.0),  // pink (same as keyword)
        "tag": SIMD4<Float>(0.455, 0.812, 0.808, 1.0),       // cyan
        "regexp": SIMD4<Float>(0.584, 0.820, 0.455, 1.0),    // green (same as string)
        "special": SIMD4<Float>(0.863, 0.631, 0.357, 1.0)    // orange
    ]

    /// Parse full content and return per-line per-character colors.
    /// Returns: Dictionary mapping line index (0-based in the content array) to array of SIMD4<Float> colors per
    /// grapheme cluster.
    func parsePerCharColors(
        lines: [String],
        language: String,
        defaultColor: SIMD4<Float>
    ) -> [Int: [SIMD4<Float>]] {
        #if os(macOS)
        let joinedText = lines.joined(separator: "\n")
        if let result = parseWithTreeSitter(
            text: joinedText,
            lines: lines,
            language: language,
            defaultColor: defaultColor
        ), !result.isEmpty {
            return result
        }
        #endif
        return parseWithRegex(lines: lines, language: language, defaultColor: defaultColor)
    }
}
