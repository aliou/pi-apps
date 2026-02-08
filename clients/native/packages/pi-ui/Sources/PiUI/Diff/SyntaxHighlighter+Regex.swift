import Foundation
import simd

// Helper struct for regex coloring parameters
struct RegexColorContext {
    let line: String
    let nsLine: NSString
    let fullRange: NSRange
    let keywords: [String]
    let colorMap: [String: SIMD4<Float>]
}

// MARK: - Regex Parsing Extension

extension SyntaxHighlighter {
    func parseWithRegex(
        lines: [String],
        language: String,
        defaultColor: SIMD4<Float>
    ) -> [Int: [SIMD4<Float>]] {
        // Simple regex fallback: keywords, strings, comments, numbers
        var result: [Int: [SIMD4<Float>]] = [:]

        let keywords = Self.keywordsFor(language: language)
        let colorMap = Self.regexColorMap()

        for (lineIdx, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }

            var colors = [SIMD4<Float>](repeating: defaultColor, count: line.count)
            let nsLine = line as NSString
            let fullRange = NSRange(location: 0, length: nsLine.length)

            let regexContext = RegexColorContext(
                line: line,
                nsLine: nsLine,
                fullRange: fullRange,
                keywords: keywords,
                colorMap: colorMap
            )
            applyRegexColors(context: regexContext, colors: &colors)

            if colors != [SIMD4<Float>](repeating: defaultColor, count: line.count) {
                result[lineIdx] = colors
            }
        }

        return result
    }

    static func regexColorMap() -> [String: SIMD4<Float>] {
        [
            "keyword": syntaxColors["keyword"] ?? SIMD4<Float>(1, 1, 1, 1),
            "string": syntaxColors["string"] ?? SIMD4<Float>(1, 1, 1, 1),
            "comment": syntaxColors["comment"] ?? SIMD4<Float>(1, 1, 1, 1),
            "number": syntaxColors["number"] ?? SIMD4<Float>(1, 1, 1, 1),
            "function": syntaxColors["function"] ?? SIMD4<Float>(1, 1, 1, 1)
        ]
    }

    func applyRegexColors(
        context: RegexColorContext,
        colors: inout [SIMD4<Float>]
    ) {
        // Apply colors in order of priority
        applyCommentColors(context: context, colors: &colors)
        applyStringColors(context: context, colors: &colors)
        applyKeywordColors(context: context, colors: &colors)
        applyNumberColors(context: context, colors: &colors)
        applyFunctionColors(context: context, colors: &colors)
    }

    func applyCommentColors(context: RegexColorContext, colors: inout [SIMD4<Float>]) {
        guard let color = context.colorMap["comment"] else { return }
        for pattern in ["//.*$", "#.*$"] {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .anchorsMatchLines) {
                for match in regex.matches(in: context.line, range: context.fullRange) {
                    applyColor(color, range: match.range, to: &colors, in: context.line)
                }
            }
        }
    }

    func applyStringColors(context: RegexColorContext, colors: inout [SIMD4<Float>]) {
        guard let color = context.colorMap["string"] else { return }
        let stringPattern = "\"[^\"\\\\]*(\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(\\\\.[^'\\\\]*)*'"
        if let regex = try? NSRegularExpression(pattern: stringPattern) {
            for match in regex.matches(in: context.line, range: context.fullRange) {
                applyColor(color, range: match.range, to: &colors, in: context.line)
            }
        }
    }

    func applyKeywordColors(context: RegexColorContext, colors: inout [SIMD4<Float>]) {
        guard let color = context.colorMap["keyword"] else { return }
        for keyword in context.keywords {
            let pattern = "\\b\(NSRegularExpression.escapedPattern(for: keyword))\\b"
            if let regex = try? NSRegularExpression(pattern: pattern) {
                for match in regex.matches(in: context.line, range: context.fullRange) {
                    applyColor(color, range: match.range, to: &colors, in: context.line)
                }
            }
        }
    }

    func applyNumberColors(context: RegexColorContext, colors: inout [SIMD4<Float>]) {
        guard let color = context.colorMap["number"] else { return }
        if let regex = try? NSRegularExpression(pattern: "\\b\\d+(\\.\\d+)?\\b") {
            for match in regex.matches(in: context.line, range: context.fullRange) {
                applyColor(color, range: match.range, to: &colors, in: context.line)
            }
        }
    }

    func applyFunctionColors(context: RegexColorContext, colors: inout [SIMD4<Float>]) {
        guard let color = context.colorMap["function"] else { return }
        let functionPattern = "\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\("
        if let regex = try? NSRegularExpression(pattern: functionPattern) {
            for match in regex.matches(in: context.line, range: context.fullRange) {
                let nameRange = match.range(at: 1)
                if nameRange.location != NSNotFound {
                    applyColor(color, range: nameRange, to: &colors, in: context.line)
                }
            }
        }
    }

    /// Apply a color to a grapheme-cluster-indexed color array given an NSRange (UTF-16 based)
    func applyColor(
        _ color: SIMD4<Float>,
        range: NSRange,
        to colors: inout [SIMD4<Float>],
        in string: String
    ) {
        guard let swiftRange = Range(range, in: string) else { return }
        let startIdx = string.distance(from: string.startIndex, to: swiftRange.lowerBound)
        let endIdx = string.distance(from: string.startIndex, to: swiftRange.upperBound)
        for index in startIdx..<min(endIdx, colors.count) {
            colors[index] = color
        }
    }

    func colorCategory(for name: String) -> String? {
        let categoryMappings: [(String, String)] = [
            ("keyword", "keyword"),
            ("string", "string"),
            ("comment", "comment"),
            ("function", "function"),
            ("type", "type"),
            ("variable", "variable"),
            ("number", "number"),
            ("boolean", "number"),
            ("operator", "operator"),
            ("tag", "tag"),
            ("regexp", "regexp"),
            ("markup", "special"),
            ("special", "special")
        ]

        for (searchKey, category) in categoryMappings where name.contains(searchKey) {
            return category
        }

        return nil
    }
}
