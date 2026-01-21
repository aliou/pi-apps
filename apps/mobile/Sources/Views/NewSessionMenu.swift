//
//  NewSessionMenu.swift
//  Pi
//
//  Top-right menu for creating new Chat or Code sessions.
//

import SwiftUI

struct NewSessionMenu: View {
    let onNewChat: () -> Void
    let onNewCodeSession: () -> Void

    var body: some View {
        Menu {
            Button {
                onNewChat()
            } label: {
                Label("New Chat", systemImage: "bubble.left")
            }

            Button {
                onNewCodeSession()
            } label: {
                Label("New Code Session", systemImage: "chevron.left.forwardslash.chevron.right")
            }
        } label: {
            Image(systemName: "plus")
                .padding(10)
                .contentShape(Circle())
        }
        .glassEffect(.regular.interactive())
    }
}

// MARK: - Previews

#Preview("New Session Menu") {
    NewSessionMenu(
        onNewChat: { print("New Chat") },
        onNewCodeSession: { print("New Code Session") }
    )
}

#Preview("New Session Menu - Dark") {
    NewSessionMenu(
        onNewChat: { print("New Chat") },
        onNewCodeSession: { print("New Code Session") }
    )
    .preferredColorScheme(.dark)
}
