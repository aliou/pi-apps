//
//  MessageBubbleView.swift
//  PiUI
//
//  Message bubble component with iOS 26 Liquid Glass effects
//

import SwiftUI
import Textual

public struct MessageBubbleView: View {
    public enum Role {
        case user
        case assistant
    }

    public let role: Role
    public let text: String
    public let isQueued: Bool

    public init(role: Role, text: String, isQueued: Bool = false) {
        self.role = role
        self.text = text
        self.isQueued = isQueued
    }

    public var body: some View {
        Group {
            switch role {
            case .user:
                userBubble
            case .assistant:
                assistantBubble
            }
        }
    }

    private var userBubble: some View {
        HStack {
            Spacer(minLength: 60)
            Text(text)
                .font(.body)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .modifier(UserBubbleModifier(isQueued: isQueued))
        }
        .padding(.horizontal, 16)
    }

    private var assistantBubble: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .font(.body)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Platform/Version-specific Modifiers

private struct UserBubbleModifier: ViewModifier {
    let isQueued: Bool

    func body(content: Content) -> some View {
        let tint = isQueued ? Theme.queuedUserMessageTint : Theme.userMessageTint
        let background = isQueued ? Theme.queuedUserMessageBg : Theme.userMessageBg

        if #available(iOS 26.0, macOS 26.0, *) {
            #if os(iOS)
            content.glassEffect(.regular.tint(tint), in: .rect(cornerRadius: 16))
            #else
            content
                .background(background)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            #endif
        } else {
            content
                .background(background)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }
}

// MARK: - Streaming Bubble

public struct StreamingBubbleView: View {
    public let text: String

    public init(text: String) {
        self.text = text
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            StructuredText(markdown: text)
                .textual.structuredTextStyle(PiMarkdownStyle())
                .textual.textSelection(.enabled)
                .font(.body)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Processing Indicator

public struct ProcessingIndicatorView: View {
    public init() {}

    public var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.8)
            Text("Thinking...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }
}

// MARK: - Previews

#Preview("User Message") {
    VStack(spacing: 16) {
        MessageBubbleView(role: .user, text: "Hello, how can you help me today?")
        MessageBubbleView(role: .user, text: "This is a longer message that spans multiple lines to test the layout behavior of the user message bubble.")
    }
    .padding(.vertical)
}

#Preview("Assistant Message") {
    VStack(spacing: 16) {
        MessageBubbleView(role: .assistant, text: "I can help you with coding tasks, answering questions, and more!")
        MessageBubbleView(role: .assistant, text: "Here's some **bold text** and `inline code` to demonstrate markdown rendering.")
    }
    .padding(.vertical)
}

#Preview("Conversation") {
    ScrollView {
        VStack(spacing: 12) {
            MessageBubbleView(role: .user, text: "Find all TODO comments")
            MessageBubbleView(role: .assistant, text: "I'll search for **TODO** comments in your codebase.\n\n```swift\nlet x = 1\n```")
            StreamingBubbleView(text: "Currently searching through the files...")
            ProcessingIndicatorView()
        }
        .padding(.vertical)
    }
}

#Preview("Dark Mode") {
    VStack(spacing: 16) {
        MessageBubbleView(role: .user, text: "Hello!")
        MessageBubbleView(role: .assistant, text: "Hi there! How can I help?")
    }
    .padding(.vertical)
    .preferredColorScheme(.dark)
}
