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
    private static let syntaxColors: [String: SIMD4<Float>] = [
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
    /// Returns: Dictionary mapping line index (0-based in the content array) to array of SIMD4<Float> colors per grapheme cluster.
    func parsePerCharColors(lines: [String], language: String, defaultColor: SIMD4<Float>) -> [Int: [SIMD4<Float>]] {
        #if os(macOS)
        if let result = parseWithTreeSitter(text: lines.joined(separator: "\n"), lines: lines, language: language, defaultColor: defaultColor), !result.isEmpty {
            return result
        }
        #endif
        return parseWithRegex(lines: lines, language: language, defaultColor: defaultColor)
    }

    #if os(macOS)
    private func parseWithTreeSitter(text: String, lines: [String], language: String, defaultColor: SIMD4<Float>) -> [Int: [SIMD4<Float>]]? {
        let cacheKey = language.lowercased()

        // Resolve CodeLanguage
        let lang: CodeLanguage
        if let cached = languageCache[cacheKey] {
            lang = cached
        } else {
            // Try to find by exact match on id
            if let direct = CodeLanguage.allLanguages.first(where: { $0.id.rawValue == language }) {
                lang = direct
            } else {
                // Try to find by file extension
                lang = CodeLanguage.allLanguages.first(where: { $0.extensions.contains(language) }) ?? .default
            }
            languageCache[cacheKey] = lang
        }

        guard lang != .default, let treeSitterLanguage = lang.language else { return nil }

        // Get or create query
        let query: Query
        if let cached = queryCache[cacheKey] {
            query = cached
        } else {
            do { try parser.setLanguage(treeSitterLanguage) } catch { return nil }
            guard let loaded = loadQuery(for: lang, treeSitterLanguage: treeSitterLanguage, languageName: language) else { return nil }
            queryCache[cacheKey] = loaded
            query = loaded
        }

        do { try parser.setLanguage(treeSitterLanguage) } catch { return nil }
        guard let tree = parser.parse(text) else { return nil }

        let cursor = query.execute(in: tree)
        let utf16View = text.utf16
        let totalUtf16Count = utf16View.count

        // Build line start offsets in UTF-16 code units
        var lineUtf16Starts: [Int] = [0]
        var offset = 0
        for codUnit in utf16View {
            offset += 1
            if codUnit == 0x0A {
                lineUtf16Starts.append(offset)
            }
        }

        // Binary search for line of a UTF-16 position
        func lineForUtf16(_ pos: Int) -> Int {
            var lo = 0, hi = lineUtf16Starts.count - 1
            while lo < hi {
                let mid = (lo + hi + 1) / 2
                if lineUtf16Starts[mid] <= pos { lo = mid } else { hi = mid - 1 }
            }
            return lo
        }

        // Collect captures
        struct Capture {
            let startUtf16: Int
            let endUtf16: Int
            let category: String
            let priority: Int
        }

        var captures: [Capture] = []
        for match in cursor {
            for cap in match.captures {
                let byteRange = cap.node.byteRange
                let start = Int(byteRange.lowerBound) / 2
                let end = Int(byteRange.upperBound) / 2
                let name = cap.name ?? ""
                guard let cat = colorCategory(for: name) else { continue }
                let pri: Int
                switch cat {
                case "comment": pri = 100
                case "string": pri = 90
                case "keyword": pri = 80
                case "function": pri = 70
                case "type": pri = 60
                case "number": pri = 50
                case "variable": pri = 40
                default: pri = 10
                }
                captures.append(Capture(startUtf16: start, endUtf16: end, category: cat, priority: pri))
            }
        }

        // Sort by priority desc
        captures.sort { $0.priority > $1.priority }

        // Filter overlapping (higher priority wins)
        var claimed: [(start: Int, end: Int)] = []
        var filtered: [Capture] = []
        for cap in captures {
            let len = cap.endUtf16 - cap.startUtf16
            guard len > 0 else { continue }
            var overlapping = false
            for c in claimed {
                if c.end <= cap.startUtf16 { continue }
                if c.start >= cap.endUtf16 { break }
                let os = max(cap.startUtf16, c.start)
                let oe = min(cap.endUtf16, c.end)
                if os < oe && (oe - os) > len / 2 { overlapping = true; break }
            }
            if !overlapping {
                let idx = claimed.firstIndex { $0.start > cap.startUtf16 } ?? claimed.count
                claimed.insert((cap.startUtf16, cap.endUtf16), at: idx)
                filtered.append(cap)
            }
        }

        // Build per-line color arrays
        var result: [Int: [SIMD4<Float>]] = [:]
        // Pre-build color arrays with default color
        for (i, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }
            result[i] = [SIMD4<Float>](repeating: defaultColor, count: line.count)
        }

        // Build per-line UTF-16 to grapheme mappings
        var lineUtf16ToGrapheme: [Int: [Int]] = [:]
        for (i, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }
            var mapping: [Int] = []
            var gi = 0
            for char in line {
                for _ in 0..<char.utf16.count { mapping.append(gi) }
                gi += 1
            }
            mapping.append(gi) // sentinel
            lineUtf16ToGrapheme[i] = mapping
        }

        for cap in filtered {
            guard let color = Self.syntaxColors[cap.category] else { continue }
            let startLine = lineForUtf16(cap.startUtf16)
            let endLine = lineForUtf16(max(cap.startUtf16, cap.endUtf16 - 1))

            for lineIdx in startLine...endLine {
                guard lineIdx < lines.count else { continue }
                let lineStart = lineUtf16Starts[lineIdx]
                let lineGraphemeCount = lines[lineIdx].count
                guard lineGraphemeCount > 0 else { continue }
                guard var colors = result[lineIdx], let mapping = lineUtf16ToGrapheme[lineIdx] else { continue }

                let tokStart = max(0, cap.startUtf16 - lineStart)
                let lineUtf16End: Int
                if lineIdx + 1 < lineUtf16Starts.count {
                    lineUtf16End = lineUtf16Starts[lineIdx + 1] - 1 // exclude newline
                } else {
                    lineUtf16End = totalUtf16Count
                }
                let tokEnd = min(lineUtf16End - lineStart, cap.endUtf16 - lineStart)

                let gStart = tokStart < mapping.count ? mapping[tokStart] : lineGraphemeCount
                let gEnd = tokEnd < mapping.count ? mapping[tokEnd] : lineGraphemeCount

                for gi in gStart..<gEnd {
                    if gi < colors.count { colors[gi] = color }
                }
                result[lineIdx] = colors
            }
        }

        return result
    }

    private func loadQuery(for lang: CodeLanguage, treeSitterLanguage: Language, languageName: String) -> Query? {
        if let url = lang.queryURL, let data = try? Data(contentsOf: url), let q = try? Query(language: treeSitterLanguage, data: data) {
            return q
        }
        return getHardcodedQuery(for: treeSitterLanguage, name: languageName)
    }

    /// Hardcoded tree-sitter queries for common languages (fallback when CodeEditLanguages bundle query fails)
    private func getHardcodedQuery(for language: Language, name: String) -> Query? {
        // Just try a generic query - the bundled queries from CodeEditLanguages should cover most cases
        let generic = """
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
        guard let data = generic.data(using: .utf8) else { return nil }
        return try? Query(language: language, data: data)
    }
    #endif

    private func parseWithRegex(lines: [String], language: String, defaultColor: SIMD4<Float>) -> [Int: [SIMD4<Float>]] {
        // Simple regex fallback: keywords, strings, comments, numbers
        var result: [Int: [SIMD4<Float>]] = [:]

        let keywords = Self.keywordsFor(language: language)
        let kwColor = Self.syntaxColors["keyword"]!
        let strColor = Self.syntaxColors["string"]!
        let commentColor = Self.syntaxColors["comment"]!
        let numColor = Self.syntaxColors["number"]!
        let funcColor = Self.syntaxColors["function"]!

        for (lineIdx, line) in lines.enumerated() {
            guard !line.isEmpty else { continue }
            var colors = [SIMD4<Float>](repeating: defaultColor, count: line.count)
            let nsLine = line as NSString
            let fullRange = NSRange(location: 0, length: nsLine.length)

            // Comments
            for pattern in ["//.*$", "#.*$"] {
                if let regex = try? NSRegularExpression(pattern: pattern, options: .anchorsMatchLines) {
                    for match in regex.matches(in: line, range: fullRange) {
                        applyColor(commentColor, range: match.range, to: &colors, in: line)
                    }
                }
            }

            // Strings
            if let regex = try? NSRegularExpression(pattern: "\"[^\"\\\\]*(\\\\.[^\"\\\\]*)*\"|'[^'\\\\]*(\\\\.[^'\\\\]*)*'") {
                for match in regex.matches(in: line, range: fullRange) {
                    applyColor(strColor, range: match.range, to: &colors, in: line)
                }
            }

            // Keywords
            for kw in keywords {
                let pat = "\\b\(NSRegularExpression.escapedPattern(for: kw))\\b"
                if let regex = try? NSRegularExpression(pattern: pat) {
                    for match in regex.matches(in: line, range: fullRange) {
                        applyColor(kwColor, range: match.range, to: &colors, in: line)
                    }
                }
            }

            // Numbers
            if let regex = try? NSRegularExpression(pattern: "\\b\\d+(\\.\\d+)?\\b") {
                for match in regex.matches(in: line, range: fullRange) {
                    applyColor(numColor, range: match.range, to: &colors, in: line)
                }
            }

            // Function calls
            if let regex = try? NSRegularExpression(pattern: "\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(") {
                for match in regex.matches(in: line, range: fullRange) {
                    let nameRange = match.range(at: 1)
                    if nameRange.location != NSNotFound {
                        applyColor(funcColor, range: nameRange, to: &colors, in: line)
                    }
                }
            }

            if colors != [SIMD4<Float>](repeating: defaultColor, count: line.count) {
                result[lineIdx] = colors
            }
        }

        return result
    }

    /// Apply a color to a grapheme-cluster-indexed color array given an NSRange (UTF-16 based)
    private func applyColor(_ color: SIMD4<Float>, range: NSRange, to colors: inout [SIMD4<Float>], in string: String) {
        guard let swiftRange = Range(range, in: string) else { return }
        let startIdx = string.distance(from: string.startIndex, to: swiftRange.lowerBound)
        let endIdx = string.distance(from: string.startIndex, to: swiftRange.upperBound)
        for i in startIdx..<min(endIdx, colors.count) {
            colors[i] = color
        }
    }

    private func colorCategory(for name: String) -> String? {
        if name.contains("keyword") { return "keyword" }
        if name.contains("string") { return "string" }
        if name.contains("comment") { return "comment" }
        if name.contains("function") { return "function" }
        if name.contains("type") { return "type" }
        if name.contains("variable") { return "variable" }
        if name.contains("number") || name.contains("boolean") { return "number" }
        if name.contains("operator") { return "operator" }
        if name.contains("tag") { return "tag" }
        if name.contains("regexp") { return "regexp" }
        if name.contains("markup") || name.contains("special") { return "special" }
        return nil
    }

    private static func keywordsFor(language: String) -> [String] {
        switch language.lowercased() {
        case "swift":
            return ["class", "struct", "enum", "protocol", "extension", "func", "init", "deinit",
                    "var", "let", "static", "private", "public", "internal", "fileprivate", "open",
                    "if", "else", "guard", "switch", "case", "default", "for", "while", "repeat",
                    "in", "return", "break", "continue", "import", "typealias", "self", "Self",
                    "super", "nil", "true", "false", "try", "catch", "throw", "throws", "async",
                    "await", "override", "final", "mutating", "lazy", "weak", "unowned"]
        case "python", "py":
            return ["def", "class", "lambda", "if", "elif", "else", "for", "while", "break",
                    "continue", "return", "yield", "import", "from", "as", "try", "except",
                    "finally", "raise", "with", "async", "await", "pass", "assert", "and", "or",
                    "not", "in", "is", "None", "True", "False", "self", "global", "nonlocal"]
        case "javascript", "js", "jsx", "typescript", "ts", "tsx":
            return ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
                    "continue", "return", "function", "var", "let", "const", "class", "extends",
                    "import", "export", "from", "async", "await", "try", "catch", "finally", "throw",
                    "new", "this", "super", "typeof", "instanceof", "true", "false", "null", "undefined",
                    "interface", "type", "enum", "implements", "public", "private", "protected"]
        case "go":
            return ["if", "else", "switch", "case", "default", "for", "range", "break", "continue",
                    "return", "func", "var", "const", "type", "struct", "interface", "map", "chan",
                    "package", "import", "go", "defer", "select", "true", "false", "nil"]
        case "rust", "rs":
            return ["if", "else", "match", "loop", "while", "for", "in", "break", "continue",
                    "return", "fn", "let", "mut", "const", "static", "struct", "enum", "trait",
                    "impl", "type", "mod", "use", "pub", "crate", "super", "self", "Self",
                    "async", "await", "move", "dyn", "ref", "unsafe", "true", "false"]
        case "ruby", "rb":
            return ["if", "elsif", "else", "unless", "case", "when", "while", "until", "for",
                    "break", "next", "return", "def", "class", "module", "end", "do", "begin",
                    "rescue", "ensure", "raise", "yield", "self", "super", "true", "false", "nil"]
        case "java", "kotlin", "kt":
            return ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
                    "continue", "return", "class", "interface", "extends", "implements", "package",
                    "import", "public", "private", "protected", "static", "final", "abstract",
                    "new", "this", "super", "try", "catch", "finally", "throw", "true", "false", "null"]
        case "c", "cpp", "c++", "h", "hpp":
            return ["if", "else", "switch", "case", "default", "for", "while", "do", "break",
                    "continue", "return", "struct", "union", "enum", "typedef", "const",
                    "static", "extern", "inline", "void", "int", "char", "float", "double",
                    "class", "public", "private", "protected", "virtual", "override", "template",
                    "namespace", "using", "new", "delete", "nullptr", "true", "false", "NULL"]
        case "bash", "sh", "zsh":
            return ["if", "then", "else", "elif", "fi", "case", "esac", "for", "while", "until",
                    "do", "done", "in", "function", "return", "exit", "break", "continue",
                    "local", "export", "true", "false"]
        default:
            return ["if", "else", "for", "while", "return", "function", "var", "let", "const",
                    "class", "import", "export", "true", "false", "null"]
        }
    }
}
