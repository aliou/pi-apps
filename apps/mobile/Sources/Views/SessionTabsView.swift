//
//  SessionTabsView.swift
//  Pi
//
//  Tab-based view for Chat and Code sessions
//

import SwiftUI
import PiCore
import PiUI

struct SessionTabsView: View {
    @Environment(ServerConnection.self) private var connection
    @State private var selectedTab: SessionMode = .chat

    var body: some View {
        TabView(selection: $selectedTab) {
            ChatListView()
                .tabItem {
                    Label("Chat", systemImage: "bubble.left.and.bubble.right")
                }
                .tag(SessionMode.chat)

            CodeListView()
                .tabItem {
                    Label("Code", systemImage: "chevron.left.forwardslash.chevron.right")
                }
                .tag(SessionMode.code)
        }
    }
}

// MARK: - Preview

#Preview {
    SessionTabsView()
        .environment(ServerConnection(serverURL: URL(string: "ws://localhost:3141")!))
}
