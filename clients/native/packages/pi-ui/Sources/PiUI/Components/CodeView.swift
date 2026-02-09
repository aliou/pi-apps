import SwiftUI
import simd

/// Reusable syntax-highlighted code view backed by PiUI's diff SyntaxHighlighter.
///
/// This view does not require diff parsing; it highlights raw code text line-by-line.
public struct CodeView: View {
    public let code: String
    public let language: String?

    @State private var highlightedText: AttributedString
    private let syntaxHighlighter = SyntaxHighlighter()

    public init(code: String, language: String? = nil) {
        self.code = code
        self.language = language
        self._highlightedText = State(initialValue: AttributedString(code))
    }

    public var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Text(highlightedText)
                .font(.system(size: 13, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .task(id: "\(language ?? "")\n\(code)") {
            highlightedText = highlightedCodeText()
        }
    }

    private func highlightedCodeText() -> AttributedString {
        let lines = code.components(separatedBy: "\n")
        guard let language, !language.isEmpty else {
            return AttributedString(code)
        }

        let colorsByLine = syntaxHighlighter.parsePerCharColors(
            lines: lines,
            language: language,
            defaultColor: DiffColors.text.simd4
        )

        var result = AttributedString()

        for (lineIndex, line) in lines.enumerated() {
            let characters = Array(line)
            let colors = colorsByLine[lineIndex] ?? []

            for (charIndex, character) in characters.enumerated() {
                var part = AttributedString(String(character))
                if charIndex < colors.count {
                    part.foregroundColor = color(from: colors[charIndex])
                }
                result.append(part)
            }

            if lineIndex < lines.count - 1 {
                result.append(AttributedString("\n"))
            }
        }

        return result
    }

    private func color(from value: SIMD4<Float>) -> Color {
        Color(
            red: Double(value.x),
            green: Double(value.y),
            blue: Double(value.z),
            opacity: Double(value.w)
        )
    }
}

#Preview("Swift") {
    CodeView(
        code: """
        import Foundation

        struct User {
            let id: UUID
            let name: String
        }

        func greet(_ user: User) -> String {
            return "Hello, \\(user.name)!"
        }
        """,
        language: "swift"
    )
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 12))
    .padding()
    .background(Color.black)
    .preferredColorScheme(.dark)
}

#Preview("TypeScript") {
    CodeView(
        code: """
        export async function fetchSession(id: string) {
          const response = await fetch(`/api/sessions/${id}`)
          if (!response.ok) throw new Error("Failed")
          return response.json()
        }
        """,
        language: "typescript"
    )
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 12))
    .padding()
    .background(Color.black)
    .preferredColorScheme(.dark)
}

#Preview("No Language") {
    CodeView(
        code: "plain text output\nline 2\nline 3"
    )
    .padding(12)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 12))
    .padding()
    .background(Color.black)
    .preferredColorScheme(.dark)
}
