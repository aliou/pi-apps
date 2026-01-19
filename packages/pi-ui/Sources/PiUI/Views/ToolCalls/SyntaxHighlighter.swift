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
            case .string: return Theme.success
            case .number: return Theme.warning
            case .keyword: return Theme.mdLink
            case .key: return Theme.accent
            case .punctuation: return Theme.muted
            case .whitespace: return Theme.text
            }
        }
    }
}

enum JSONTokenizer {
    static func tokenize(_ json: String) -> [JSONToken] {
        var tokens: [JSONToken] = []
        var chars = Array(json)
        var index = 0

        // Track if we just saw a key (for coloring object keys differently)
        var expectingValue = false

        while index < chars.count {
            let char = chars[index]

            // Whitespace
            if char.isWhitespace {
                var whitespace = ""
                while index < chars.count && chars[index].isWhitespace {
                    whitespace.append(chars[index])
                    index += 1
                }
                tokens.append(JSONToken(text: whitespace, kind: .whitespace))
                continue
            }

            // String
            if char == "\"" {
                let startIndex = index
                index += 1
                var stringContent = "\""

                while index < chars.count {
                    let c = chars[index]
                    stringContent.append(c)
                    index += 1

                    if c == "\\" && index < chars.count {
                        // Escape sequence
                        stringContent.append(chars[index])
                        index += 1
                    } else if c == "\"" {
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
                expectingValue = isKey
                continue
            }

            // Number
            if char.isNumber || (char == "-" && index + 1 < chars.count && chars[index + 1].isNumber) {
                var number = ""
                while index < chars.count {
                    let c = chars[index]
                    if c.isNumber || c == "." || c == "-" || c == "+" || c == "e" || c == "E" {
                        number.append(c)
                        index += 1
                    } else {
                        break
                    }
                }
                tokens.append(JSONToken(text: number, kind: .number))
                expectingValue = false
                continue
            }

            // Keywords: true, false, null
            if char == "t" || char == "f" || char == "n" {
                let remaining = String(chars[index...])
                if remaining.hasPrefix("true") {
                    tokens.append(JSONToken(text: "true", kind: .keyword))
                    index += 4
                    expectingValue = false
                    continue
                }
                if remaining.hasPrefix("false") {
                    tokens.append(JSONToken(text: "false", kind: .keyword))
                    index += 5
                    expectingValue = false
                    continue
                }
                if remaining.hasPrefix("null") {
                    tokens.append(JSONToken(text: "null", kind: .keyword))
                    index += 4
                    expectingValue = false
                    continue
                }
            }

            // Punctuation: { } [ ] : ,
            if "{}[]:,".contains(char) {
                tokens.append(JSONToken(text: String(char), kind: .punctuation))
                if char == ":" {
                    expectingValue = true
                } else if char == "," || char == "{" || char == "[" {
                    expectingValue = false
                }
                index += 1
                continue
            }

            // Unknown character - treat as punctuation
            tokens.append(JSONToken(text: String(char), kind: .punctuation))
            index += 1
        }

        return tokens
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
        .background(Theme.pageBg)
        .previewLayout(.sizeThatFits)
    }
}
#endif
