import PiUI
import SwiftUI

struct SessionsListView: View {
    var body: some View {
        EmptyStateView(
            icon: "bubble.left",
            title: "No Sessions",
            subtitle: "Start a new chat to get going",
            actionTitle: "New Chat",
            action: {}
        )
        .navigationTitle("Chats")
    }
}
