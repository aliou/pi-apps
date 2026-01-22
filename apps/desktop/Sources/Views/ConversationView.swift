//
//  ConversationView.swift
//  pi
//
//  Desktop conversation view with expandable tool calls
//

import SwiftUI
import Textual
import PiCore
import PiUI

// MARK: - Desktop Conversation Item

/// Desktop-specific conversation item with expansion state for tool calls
enum ConversationItem: Identifiable {
    case userMessage(id: String, text: String)
    case assistantText(id: String, text: String)
    case toolCall(id: String, name: String, args: String?, output: String?, status: ToolCallStatus, isExpanded: Bool)
    case richContent(id: String, content: RichContentType, summary: String)

    var id: String {
        switch self {
        case .userMessage(let id, _): return id
        case .assistantText(let id, _): return id
        case .toolCall(let id, _, _, _, _, _): return id
        case .richContent(let id, _, _): return id
        }
    }
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
                            ProcessingIndicatorView()
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
            MessageBubbleView(role: .user, text: text)
        case .assistantText(_, let text):
            MessageBubbleView(role: .assistant, text: text)
        case .toolCall(let id, let name, let args, let output, let status, _):
            toolCallView(id: id, name: name, args: args, output: output, status: status)
        case .richContent(_, let content, let summary):
            RichContentView(content: content, summary: summary)
        }
    }

    private func toolCallView(id: String, name: String, args: String?, output: String?, status: ToolCallStatus) -> some View {
        let isExpanded = expandedToolCalls.contains(id)

        return VStack(alignment: .leading, spacing: 0) {
            // Header - using shared component with rotating chevron
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    if isExpanded {
                        expandedToolCalls.remove(id)
                    } else {
                        expandedToolCalls.insert(id)
                    }
                }
            } label: {
                ToolCallHeader(
                    toolName: name,
                    args: args,
                    status: status,
                    showChevron: true,
                    isExpanded: isExpanded
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // Expanded content - using shared tool-specific content views
            if isExpanded {
                ToolCallExpandedContent(
                    toolName: name,
                    args: args,
                    output: output,
                    status: status
                )
                .padding(.top, 12)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Theme.toolStatusBg(status))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var inputArea: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
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
