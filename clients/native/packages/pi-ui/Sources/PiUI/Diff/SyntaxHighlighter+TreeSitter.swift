import Foundation
import simd

#if os(macOS)
import SwiftTreeSitter
import CodeEditLanguages

// Helper struct for storing syntax capture information
struct SyntaxCapture {
    let startUtf16: Int
    let endUtf16: Int
    let category: String
    let priority: Int
}

// Helper struct for line coloring parameters
struct LineCaptureContext {
    let lineIdx: Int
    let lines: [String]
    let lineUtf16Starts: [Int]
    let lineUtf16ToGrapheme: [Int: [Int]]
    let totalUtf16Count: Int
}

// MARK: - TreeSitter Parsing Extension

extension SyntaxHighlighter {
    func parseWithTreeSitter(
        text: String,
        lines: [String],
        language: String,
        defaultColor: SIMD4<Float>
    ) -> [Int: [SIMD4<Float>]]? {
        let cacheKey = language.lowercased()

        let lang = resolveLanguage(cacheKey: cacheKey, language: language)
        guard lang != .default, let treeSitterLanguage = lang.language else { return nil }

        let query = resolveQuery(cacheKey: cacheKey, lang: lang, treeSitterLanguage: treeSitterLanguage)
        guard let query else { return nil }

        guard let tree = parseTree(text: text, treeSitterLanguage: treeSitterLanguage) else { return nil }

        let lineUtf16Starts = buildLineUtf16Offsets(text: text)
        let captures = extractCaptures(from: query, in: tree)
        let filteredCaptures = filterOverlappingCaptures(captures)

        return applyColorsToLines(
            lines: lines,
            captures: filteredCaptures,
            defaultColor: defaultColor,
            lineUtf16Starts: lineUtf16Starts,
            totalUtf16Count: text.utf16.count
        )
    }

    func resolveLanguage(cacheKey: String, language: String) -> CodeLanguage {
        if let cached = languageCache[cacheKey] {
            return cached
        }

        let lang: CodeLanguage
        if let direct = CodeLanguage.allLanguages.first(where: { $0.id.rawValue == language }) {
            lang = direct
        } else {
            lang = CodeLanguage.allLanguages.first(where: { $0.extensions.contains(language) }) ?? .default
        }

        languageCache[cacheKey] = lang
        return lang
    }

    func resolveQuery(
        cacheKey: String,
        lang: CodeLanguage,
        treeSitterLanguage: Language
    ) -> Query? {
        if let cached = queryCache[cacheKey] {
            return cached
        }

        do { try parser.setLanguage(treeSitterLanguage) } catch { return nil }
        guard let loaded = loadQuery(for: lang, treeSitterLanguage: treeSitterLanguage) else { return nil }
        queryCache[cacheKey] = loaded
        return loaded
    }

    func parseTree(text: String, treeSitterLanguage: Language) -> MutableTree? {
        do { try parser.setLanguage(treeSitterLanguage) } catch { return nil }
        return parser.parse(text)
    }

    func buildLineUtf16Offsets(text: String) -> [Int] {
        var lineUtf16Starts: [Int] = [0]
        var offset = 0
        for codeUnit in text.utf16 {
            offset += 1
            if codeUnit == 0x0A {
                lineUtf16Starts.append(offset)
            }
        }
        return lineUtf16Starts
    }

    func extractCaptures(from query: Query, in tree: MutableTree) -> [SyntaxCapture] {
        let cursor = query.execute(in: tree)
        var captures: [SyntaxCapture] = []

        for match in cursor {
            for cap in match.captures {
                let byteRange = cap.node.byteRange
                let start = Int(byteRange.lowerBound) / 2
                let end = Int(byteRange.upperBound) / 2
                let name = cap.name ?? ""

                guard let cat = colorCategory(for: name) else { continue }
                let priority = priorityForCategory(cat)
                captures.append(SyntaxCapture(startUtf16: start, endUtf16: end, category: cat, priority: priority))
            }
        }

        return captures
    }

    func priorityForCategory(_ category: String) -> Int {
        switch category {
        case "comment": return 100
        case "string": return 90
        case "keyword": return 80
        case "function": return 70
        case "type": return 60
        case "number": return 50
        case "variable": return 40
        default: return 10
        }
    }

    func filterOverlappingCaptures(_ captures: [SyntaxCapture]) -> [SyntaxCapture] {
        var sorted = captures
        sorted.sort { $0.priority > $1.priority }

        var claimed: [(start: Int, end: Int)] = []
        var filtered: [SyntaxCapture] = []

        for cap in sorted {
            let length = cap.endUtf16 - cap.startUtf16
            guard length > 0 else { continue }

            var overlapping = false
            for claimedRange in claimed {
                if claimedRange.end <= cap.startUtf16 { continue }
                if claimedRange.start >= cap.endUtf16 { break }

                let operatorStart = max(cap.startUtf16, claimedRange.start)
                let operatorEnd = min(cap.endUtf16, claimedRange.end)
                if operatorStart < operatorEnd && (operatorEnd - operatorStart) > length / 2 {
                    overlapping = true
                    break
                }
            }

            if !overlapping {
                let insertIdx = claimed.firstIndex { $0.start > cap.startUtf16 } ?? claimed.count
                claimed.insert((cap.startUtf16, cap.endUtf16), at: insertIdx)
                filtered.append(cap)
            }
        }

        return filtered
    }

    func applyColorsToLines(
        lines: [String],
        captures: [SyntaxCapture],
        defaultColor: SIMD4<Float>,
        lineUtf16Starts: [Int],
        totalUtf16Count: Int
    ) -> [Int: [SIMD4<Float>]] {
        var result: [Int: [SIMD4<Float>]] = [:]

        // Pre-build color arrays with default color
        for (index, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }
            result[index] = [SIMD4<Float>](repeating: defaultColor, count: line.count)
        }

        // Build per-line UTF-16 to grapheme mappings
        let lineUtf16ToGrapheme = buildGraphemeMappings(lines: lines)

        // Apply colors from captures
        for cap in captures {
            guard let color = Self.syntaxColors[cap.category] else { continue }

            let startLine = lineForUtf16(cap.startUtf16, in: lineUtf16Starts)
            let endLine = lineForUtf16(max(cap.startUtf16, cap.endUtf16 - 1), in: lineUtf16Starts)

            for lineIdx in startLine...endLine {
                let context = LineCaptureContext(
                    lineIdx: lineIdx,
                    lines: lines,
                    lineUtf16Starts: lineUtf16Starts,
                    lineUtf16ToGrapheme: lineUtf16ToGrapheme,
                    totalUtf16Count: totalUtf16Count
                )
                applyCapturesToLine(context: context, capture: cap, color: color, result: &result)
            }
        }

        return result
    }

    func buildGraphemeMappings(lines: [String]) -> [Int: [Int]] {
        var lineUtf16ToGrapheme: [Int: [Int]] = [:]

        for (index, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }

            var mapping: [Int] = []
            var charIndex = 0
            for character in line {
                for _ in 0..<character.utf16.count { mapping.append(charIndex) }
                charIndex += 1
            }
            mapping.append(charIndex) // sentinel
            lineUtf16ToGrapheme[index] = mapping
        }

        return lineUtf16ToGrapheme
    }

    func lineForUtf16(_ position: Int, in lineUtf16Starts: [Int]) -> Int {
        var lowerBound = 0
        var upperBound = lineUtf16Starts.count - 1

        while lowerBound < upperBound {
            let mid = (lowerBound + upperBound + 1) / 2
            if lineUtf16Starts[mid] <= position {
                lowerBound = mid
            } else {
                upperBound = mid - 1
            }
        }

        return lowerBound
    }

    func applyCapturesToLine(
        context: LineCaptureContext,
        capture: SyntaxCapture,
        color: SIMD4<Float>,
        result: inout [Int: [SIMD4<Float>]]
    ) {
        guard context.lineIdx < context.lines.count else { return }

        let lineStart = context.lineUtf16Starts[context.lineIdx]
        let lineGraphemeCount = context.lines[context.lineIdx].count
        guard lineGraphemeCount > 0 else { return }
        guard var colors = result[context.lineIdx],
              let mapping = context.lineUtf16ToGrapheme[context.lineIdx] else { return }

        let tokStart = max(0, capture.startUtf16 - lineStart)
        let lineUtf16End: Int
        if context.lineIdx + 1 < context.lineUtf16Starts.count {
            lineUtf16End = context.lineUtf16Starts[context.lineIdx + 1] - 1 // exclude newline
        } else {
            lineUtf16End = context.totalUtf16Count
        }
        let tokEnd = min(lineUtf16End - lineStart, capture.endUtf16 - lineStart)

        let graphemeStart = tokStart < mapping.count ? mapping[tokStart] : lineGraphemeCount
        let graphemeEnd = tokEnd < mapping.count ? mapping[tokEnd] : lineGraphemeCount

        for charIndex in graphemeStart..<graphemeEnd where charIndex < colors.count {
            colors[charIndex] = color
        }

        result[context.lineIdx] = colors
    }

    func loadQuery(for lang: CodeLanguage, treeSitterLanguage: Language) -> Query? {
        if let url = lang.queryURL,
           let data = try? Data(contentsOf: url),
           let query = try? Query(language: treeSitterLanguage, data: data) {
            return query
        }
        return getHardcodedQuery(for: treeSitterLanguage)
    }

    /// Hardcoded tree-sitter queries for common languages (fallback when CodeEditLanguages
    /// bundle query fails)
    func getHardcodedQuery(for language: Language) -> Query? {
        let genericQuery = """
        (comment) @comment
        (line_comment) @comment
        (block_comment) @comment
        (string) @string
        (string_literal) @string
        (number) @number
        (integer) @number
        (float) @number
        (true) @boolean
        (false) @boolean
        """
        guard let data = genericQuery.data(using: .utf8) else { return nil }
        return try? Query(language: language, data: data)
    }
}
#endif
