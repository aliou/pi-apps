//
//  ToolCallHelperViews.swift
//  PiUI
//
//  Helper views for tool call content display
//

import SwiftUI

// MARK: - Helper Views

struct DetailRow<Content: View>: View {
    let label: String
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(.secondary.opacity(0.6))
                .frame(width: 16)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary.opacity(0.6))
                .frame(width: 80, alignment: .leading)

            content()

            Spacer(minLength: 0)
        }
    }
}

struct SectionLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary.opacity(0.6))
            .textCase(.uppercase)
    }
}

struct OutputSection: View {
    let title: String
    let output: String
    var isError: Bool = false
    var maxLines: Int = 50

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(title: title)

            ScrollView {
                Text(output)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(isError ? .red : .primary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 300)
            .padding(10)
            .background(Color.gray.opacity(0.1))
            .cornerRadius(8)
        }
    }
}

// MARK: - Previews

#if DEBUG
struct ToolCallHelperViews_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            // DetailRow example
            DetailRow(label: "File", icon: "doc.text") {
                Text("path/to/file.swift")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.teal)
            }

            // SectionLabel example
            SectionLabel(title: "Output")

            // OutputSection example
            OutputSection(
                title: "Content",
                output: "Line 1\nLine 2\nLine 3"
            )
        }
        .padding()
        .previewLayout(.sizeThatFits)
    }
}

struct ToolCallContentViews_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Read tool (current)
                ToolCallExpandedContent(
                    toolName: "read",
                    args: "{\"path\": \"src/main.swift\", \"offset\": 10, \"limit\": 50}",
                    output: """
                        import Foundation

                        class App {
                            func run() {
                                print("Hello")
                            }
                        }
                        """,
                    status: .success
                )

                Divider()

                // Read tool code rendering prototype (new CodeView)
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel(title: "Read CodeView Prototype")
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
                    .frame(height: 220)
                    .padding(10)
                    .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 8))
                }

                Divider()

                // Edit tool with diff rendering
                ToolCallExpandedContent(
                    toolName: "edit",
                    args: """
                    {"path":"src/main.swift","oldText":"let count = 0","newText":"let count = 1"}
                    """,
                    output: "Successfully replaced text in src/main.swift",
                    status: .success
                )

                Divider()

                // Bash tool
                ToolCallExpandedContent(
                    toolName: "bash",
                    args: "{\"command\": \"npm run build && npm test\", \"timeout\": 30}",
                    output: "> build\nCompiling...\nDone in 2.3s",
                    status: .success
                )

                Divider()

                // Unknown tool
                ToolCallExpandedContent(
                    toolName: "custom_tool",
                    args: "{\"foo\": \"bar\", \"count\": 42, \"enabled\": true}",
                    output: "Custom output here",
                    status: .success
                )
            }
            .padding()
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
        .previewLayout(.sizeThatFits)
    }
}
#endif
