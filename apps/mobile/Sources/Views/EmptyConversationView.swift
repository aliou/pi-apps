//
//  EmptyConversationView.swift
//  Pi
//
//  Empty state shown when a conversation has no messages.
//

import SwiftUI
import PiCore

struct EmptyConversationView: View {
    let mode: SessionMode
    let modelName: String?

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(description)
        }
    }

    private var title: String {
        switch mode {
        case .chat:
            "Start a Conversation"
        case .code:
            "Start Coding"
        }
    }

    private var icon: String {
        switch mode {
        case .chat:
            "bubble.left.and.bubble.right"
        case .code:
            "chevron.left.forwardslash.chevron.right"
        }
    }

    private var description: String {
        if let modelName {
            switch mode {
            case .chat:
                "Ask \(modelName) anything"
            case .code:
                "Let \(modelName) help you code"
            }
        } else {
            switch mode {
            case .chat:
                "Select a model to begin"
            case .code:
                "Select a model and repository to begin"
            }
        }
    }
}

// MARK: - Previews

#Preview("Chat Empty - With Model") {
    EmptyConversationView(mode: .chat, modelName: "Claude Sonnet 4.5")
}

#Preview("Chat Empty - No Model") {
    EmptyConversationView(mode: .chat, modelName: nil)
}

#Preview("Code Empty - With Model") {
    EmptyConversationView(mode: .code, modelName: "Claude Sonnet 4.5")
}

#Preview("Code Empty - No Model") {
    EmptyConversationView(mode: .code, modelName: nil)
}

#Preview("Chat Empty - Dark") {
    ZStack {
        Color.black.ignoresSafeArea()
        EmptyConversationView(mode: .chat, modelName: "GPT-5.2")
    }
    .preferredColorScheme(.dark)
}
