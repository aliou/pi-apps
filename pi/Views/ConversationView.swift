//
//  ConversationView.swift
//  pi
//

import SwiftUI
import Textual

// MARK: - Conversation Item

enum ConversationItem: Identifiable {
    case userMessage(id: String, text: String)
    case assistantText(id: String, text: String)
    case toolCall(id: String, name: String, args: String?, output: String?, status: ToolCallStatus, isExpanded: Bool)

    var id: String {
        switch self {
        case .userMessage(let id, _): return id
        case .assistantText(let id, _): return id
        case .toolCall(let id, _, _, _, _, _): return id
        }
    }
}

enum ToolCallStatus {
    case running
    case success
    case error
}

// MARK: - ConversationView

struct ConversationView: View {
    let items: [ConversationItem]
    let isProcessing: Bool
    @Binding var expandedToolCalls: Set<String>
    let onSendMessage: (String) -> Void
    let onAbort: () -> Void

    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(items) { item in
                            itemView(item)
                                .id(item.id)
                        }

                        if isProcessing {
                            HStack(spacing: 8) {
                                ProgressView()
                                    .scaleEffect(0.7)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .gray))
                                Text("Thinking...")
                                    .font(.system(size: 13))
                                    .foregroundColor(.gray)
                            }
                            .padding(.leading, 16)
                            .id("processing")
                        }

                        Color.clear
                            .frame(height: 1)
                            .id("bottom")
                    }
                    .padding(16)
                }
                .onChange(of: items.count) { oldCount, newCount in
                    guard newCount > oldCount else { return }
                    DispatchQueue.main.async {
                        proxy.scrollTo("bottom", anchor: .bottom)
                    }
                }
            }

            Divider()
                .background(Theme.darkGray)

            inputArea
        }
        .background(Theme.pageBg)
    }

    @ViewBuilder
    private func itemView(_ item: ConversationItem) -> some View {
        switch item {
        case .userMessage(_, let text):
            userMessageView(text)
        case .assistantText(_, let text):
            assistantTextView(text)
        case .toolCall(let id, let name, let args, let output, let status, _):
            toolCallView(id: id, name: name, args: args, output: output, status: status)
        }
    }

    private func userMessageView(_ text: String) -> some View {
        HStack {
            Spacer()
            Text(text)
                .font(.system(size: 14))
                .foregroundColor(Theme.text)
                .textSelection(.enabled)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Theme.userMessageBg)
                .cornerRadius(12)
        }
        .padding(.leading, 60)
    }

    private func assistantTextView(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 6, height: 6)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .textual.overflowMode(.scroll)
                .font(.system(size: 14))
                .foregroundStyle(Theme.text)
        }
        .padding(.trailing, 40)
    }

    private func toolCallView(id: String, name: String, args: String?, output: String?, status: ToolCallStatus) -> some View {
        let isExpanded = expandedToolCalls.contains(id)
        let parsedArgs = parseArgs(args)

        return VStack(alignment: .leading, spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    if isExpanded {
                        expandedToolCalls.remove(id)
                    } else {
                        expandedToolCalls.insert(id)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Theme.toolStatusColor(status))
                        .frame(width: 6, height: 6)

                    toolHeaderText(name: name, args: parsedArgs)

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.dim)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Expanded content
            if isExpanded, let output, !output.isEmpty {
                toolOutputView(name: name, output: output)
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(toolBackground(status: status))
        .cornerRadius(8)
    }

    @ViewBuilder
    private func toolHeaderText(name: String, args: [String: Any]) -> some View {
        switch name {
        case "read":
            let path = shortenPath(args["path"] as? String ?? "")
            let offset = args["offset"] as? Int
            let limit = args["limit"] as? Int

            HStack(spacing: 4) {
                Text("read")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                if let offset {
                    Text(":\(offset)")
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundColor(.yellow)
                    if let limit {
                        Text("-\(offset + limit - 1)")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.yellow)
                    }
                }
            }

        case "write":
            let path = shortenPath(args["path"] as? String ?? "")
            HStack(spacing: 4) {
                Text("write")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
            }

        case "edit":
            let path = shortenPath(args["path"] as? String ?? "")
            HStack(spacing: 4) {
                Text("edit")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path.isEmpty ? "..." : path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
            }

        case "bash":
            let command = args["command"] as? String ?? ""
            HStack(spacing: 4) {
                Text("$")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(command.isEmpty ? "..." : truncateText(command, maxLength: 60))
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.muted)
                    .lineLimit(1)
            }

        case "ls":
            let path = shortenPath(args["path"] as? String ?? ".")
            let limit = args["limit"] as? Int
            HStack(spacing: 4) {
                Text("ls")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(path)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                if let limit {
                    Text("(limit \(limit))")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.dim)
                }
            }

        case "find":
            let pattern = args["pattern"] as? String ?? ""
            let path = shortenPath(args["path"] as? String ?? ".")
            HStack(spacing: 4) {
                Text("find")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(pattern.isEmpty ? "..." : pattern)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                Text("in \(path)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(Theme.dim)
            }

        case "grep":
            let pattern = args["pattern"] as? String ?? ""
            let path = shortenPath(args["path"] as? String ?? ".")
            let glob = args["glob"] as? String
            HStack(spacing: 4) {
                Text("grep")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                Text(pattern.isEmpty ? "..." : "/\(pattern)/")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(Theme.accent)
                Text("in \(path)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(Theme.dim)
                if let glob {
                    Text("(\(glob))")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.dim)
                }
            }

        default:
            HStack(spacing: 4) {
                Text(name)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(Theme.text)
                if !args.isEmpty {
                    Text(truncateText(argsToString(args), maxLength: 40))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(Theme.dim)
                        .lineLimit(1)
                }
            }
        }
    }

    @ViewBuilder
    private func toolOutputView(name: String, output: String) -> some View {
        let lines = output.components(separatedBy: .newlines)
        let maxPreviewLines = 10
        let displayLines = Array(lines.prefix(maxPreviewLines))
        let remaining = lines.count - maxPreviewLines

        VStack(alignment: .leading, spacing: 4) {
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(displayLines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Theme.muted)
                    }

                    if remaining > 0 {
                        Text("... (\(remaining) more lines)")
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(Theme.dim)
                    }
                }
            }
            .frame(maxHeight: 200)
            .textSelection(.enabled)
        }
        .padding(8)
        .background(Theme.pageBg)
        .cornerRadius(4)
    }

    private func toolBackground(status: ToolCallStatus) -> Color {
        Theme.toolStatusBg(status)
    }

    private var inputArea: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundColor(Theme.text)
                .focused($isInputFocused)
                .lineLimit(1...5)
                .onSubmit {
                    sendMessage()
                }

            if isProcessing {
                Button {
                    onAbort()
                } label: {
                    Image(systemName: "stop.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Theme.error)
                }
                .buttonStyle(.plain)
            } else {
                Button {
                    sendMessage()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(inputText.isEmpty ? Theme.darkGray : Theme.accent)
                }
                .buttonStyle(.plain)
                .disabled(inputText.isEmpty)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.inputBg)
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        onSendMessage(text)
    }

    // MARK: - Helpers

    private func parseArgs(_ args: String?) -> [String: Any] {
        guard let args,
              let data = args.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return json
    }

    private func argsToString(_ args: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: args, options: [.sortedKeys]),
              let string = String(data: data, encoding: .utf8) else {
            return ""
        }
        return string
    }

    private func shortenPath(_ path: String) -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        if path.hasPrefix(home) {
            return "~" + path.dropFirst(home.count)
        }
        return path
    }

    private func truncateText(_ text: String, maxLength: Int) -> String {
        let cleaned = text.replacingOccurrences(of: "\n", with: " ")
        if cleaned.count > maxLength {
            return String(cleaned.prefix(maxLength)) + "..."
        }
        return cleaned
    }
}

// MARK: - Preview

#Preview {
    ConversationView(
        items: [
            .userMessage(id: "1", text: "Find all TODO comments"),
            .assistantText(id: "2", text: "I'll search for **TODO** comments.\n\n```swift\nlet x = 1\n```"),
            .toolCall(id: "3", name: "grep", args: "{\"pattern\":\"TODO\",\"path\":\".\"}", output: "src/main.swift:10: // TODO: fix this", status: .success, isExpanded: true),
            .toolCall(id: "4", name: "bash", args: "{\"command\":\"ls -la\"}", output: nil, status: .running, isExpanded: false)
        ],
        isProcessing: false,
        expandedToolCalls: .constant(["3"]),
        onSendMessage: { _ in },
        onAbort: {}
    )
    .frame(width: 600, height: 500)
}
