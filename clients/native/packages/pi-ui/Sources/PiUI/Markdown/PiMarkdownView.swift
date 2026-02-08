import SwiftUI
import Textual

/// Renders a markdown string using Textual with Pi styling and text selection enabled.
public struct PiMarkdownView: View {
    let markdown: String

    public init(_ markdown: String) {
        self.markdown = markdown
    }

    public var body: some View {
        StructuredText(markdown: markdown)
            .textual.structuredTextStyle(.piStyle)
            .textual.textSelection(.enabled)
    }
}

#Preview("Sample markdown") {
    PiMarkdownView("""
    # Heading 1
    ## Heading 2

    This is **bold** and this is *italic* text.

    ```swift
    func greet(name: String) {
        print("Hello, \\(name)!")
    }
    ```

    - First item
    - Second item
    - Third item
    """)
    .padding()
}
