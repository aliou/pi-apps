//
//  SyntaxHighlighter.swift
//  PiUI
//
//  Basic syntax highlighting for JSON and code output
//

import SwiftUI

// MARK: - Syntax Highlighted Text

/// A view that displays JSON with syntax highlighting
public struct SyntaxHighlightedJSON: View {
    public let json: String

    public init(_ json: String) {
        self.json = json
    }

    public var body: some View {
        let tokens = JSONTokenizer.tokenize(json)

        Text(buildAttributedString(tokens: tokens))
            .font(.system(size: 13, design: .monospaced))
            .textSelection(.enabled)
    }

    private func buildAttributedString(tokens: [JSONToken]) -> AttributedString {
        var result = AttributedString()

        for token in tokens {
            var part = AttributedString(token.text)
            part.foregroundColor = token.color
            result.append(part)
        }

        return result
    }
}

// MARK: - JSON Tokenizer

struct JSONToken {
    let text: String
    let kind: TokenKind
    var color: Color {
        kind.color
    }

    enum TokenKind {
        case string
        case number
        case keyword   // true, false, null
        case key
        case punctuation
        case whitespace

        var color: Color {
            switch self {
            case .string: return .green
            case .number: return .yellow
            case .keyword: return .blue
            case .key: return .teal
            case .punctuation: return .secondary
            case .whitespace: return .primary
            }
        }
    }
}

enum JSONTokenizer {
    static func tokenize(_ json: String) -> [JSONToken] {
        var tokens: [JSONToken] = []
        let chars = Array(json)
        var index = 0

        while index < chars.count {
            let char = chars[index]

            // Whitespace
            if char.isWhitespace {
                consumeWhitespace(&tokens, chars: chars, index: &index)
                continue
            }

            // String
            if char == "\"" {
                consumeString(&tokens, chars: chars, index: &index)
                continue
            }

            // Number
            if isNumberStart(char, chars: chars, index: index) {
                consumeNumber(&tokens, chars: chars, index: &index)
                continue
            }

            // Keywords: true, false, null
            if consumeKeyword(&tokens, chars: chars, index: &index) {
                continue
            }

            // Punctuation: { } [ ] : ,
            if "{}[]:,".contains(char) {
                tokens.append(JSONToken(text: String(char), kind: .punctuation))
                index += 1
                continue
            }

            // Unknown character - treat as punctuation
            tokens.append(JSONToken(text: String(char), kind: .punctuation))
            index += 1
        }

        return tokens
    }

    private static func consumeWhitespace(
        _ tokens: inout [JSONToken],
        chars: [Character],
        index: inout Int
    ) {
        var whitespace = ""
        while index < chars.count && chars[index].isWhitespace {
            whitespace.append(chars[index])
            index += 1
        }
        tokens.append(JSONToken(text: whitespace, kind: .whitespace))
    }

    private static func consumeString(
        _ tokens: inout [JSONToken],
        chars: [Character],
        index: inout Int
    ) {
        index += 1
        var stringContent = "\""

        while index < chars.count {
            let currentChar = chars[index]
            stringContent.append(currentChar)
            index += 1

            if currentChar == "\\" && index < chars.count {
                // Escape sequence
                stringContent.append(chars[index])
                index += 1
            } else if currentChar == "\"" {
                break
            }
        }

        // Determine if this is a key or value
        // Keys are followed by ':'
        var isKey = false
        var lookAhead = index
        while lookAhead < chars.count && chars[lookAhead].isWhitespace {
            lookAhead += 1
        }
        if lookAhead < chars.count && chars[lookAhead] == ":" {
            isKey = true
        }

        tokens.append(JSONToken(text: stringContent, kind: isKey ? .key : .string))
    }

    private static func consumeNumber(
        _ tokens: inout [JSONToken],
        chars: [Character],
        index: inout Int
    ) {
        var number = ""
        while index < chars.count {
            let currentChar = chars[index]
            if isNumberChar(currentChar) {
                number.append(currentChar)
                index += 1
            } else {
                break
            }
        }
        tokens.append(JSONToken(text: number, kind: .number))
    }

    private static func consumeKeyword(
        _ tokens: inout [JSONToken],
        chars: [Character],
        index: inout Int
    ) -> Bool {
        let char = chars[index]
        guard char == "t" || char == "f" || char == "n" else { return false }

        let remaining = String(chars[index...])

        if remaining.hasPrefix("true") {
            tokens.append(JSONToken(text: "true", kind: .keyword))
            index += 4
            return true
        }
        if remaining.hasPrefix("false") {
            tokens.append(JSONToken(text: "false", kind: .keyword))
            index += 5
            return true
        }
        if remaining.hasPrefix("null") {
            tokens.append(JSONToken(text: "null", kind: .keyword))
            index += 4
            return true
        }

        return false
    }

    private static func isNumberStart(
        _ char: Character,
        chars: [Character],
        index: Int
    ) -> Bool {
        if char.isNumber {
            return true
        }
        if char == "-" && index + 1 < chars.count && chars[index + 1].isNumber {
            return true
        }
        return false
    }

    private static func isNumberChar(_ char: Character) -> Bool {
        return char.isNumber || char == "." || char == "-" || char == "+" ||
            char == "e" || char == "E"
    }
}

// MARK: - Preview

#if DEBUG
struct SyntaxHighlightedJSON_Previews: PreviewProvider {
    static let sampleJSON = """
    {
        "path": "/Users/test/file.swift",
        "offset": 10,
        "limit": 50,
        "enabled": true,
        "value": null,
        "tags": ["swift", "ios"]
    }
    """

    static var previews: some View {
        ScrollView {
            SyntaxHighlightedJSON(sampleJSON)
                .padding()
        }
        .background(Color.gray.opacity(0.05))
        .previewLayout(.sizeThatFits)
    }
}
#endif
