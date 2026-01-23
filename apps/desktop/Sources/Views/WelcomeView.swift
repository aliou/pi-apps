//
//  WelcomeView.swift
//  pi
//
//  Empty state view when no session is selected, adapts to current mode
//

import SwiftUI
import PiUI

struct WelcomeView: View {
    let mode: SidebarMode
    let onNewChat: () -> Void
    let onNewCodeSession: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: mode == .chat ? "bubble.left.and.bubble.right" : "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 48))
                    .foregroundStyle(.secondary)

                Text(mode == .chat ? "Start a Conversation" : "Start Coding")
                    .font(.title)
                    .fontWeight(.semibold)

                Text(mode == .chat
                    ? "Chat with Pi about anything"
                    : "Open a project folder to work with Pi")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            Button {
                if mode == .chat {
                    onNewChat()
                } else {
                    onNewCodeSession()
                }
            } label: {
                Label(
                    mode == .chat ? "New Chat" : "Open Project",
                    systemImage: mode == .chat ? "plus.bubble" : "folder.badge.plus"
                )
                .frame(minWidth: 120)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Spacer()

            Text(mode == .chat
                ? "Press Cmd+N to start a new chat"
                : "Press Cmd+Shift+N to open a project")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Preview

#Preview("Chat Mode") {
    WelcomeView(
        mode: .chat,
        onNewChat: {},
        onNewCodeSession: {}
    )
    .frame(width: 600, height: 400)
}

#Preview("Code Mode") {
    WelcomeView(
        mode: .code,
        onNewChat: {},
        onNewCodeSession: {}
    )
    .frame(width: 600, height: 400)
}
