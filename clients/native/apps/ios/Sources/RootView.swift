import SwiftUI
import PiCore

struct RootView: View {
    var body: some View {
        TabView {
            Tab("Chats", systemImage: "bubble.left.and.bubble.right") {
                NavigationStack {
                    SessionsListView(mode: .chat)
                }
            }

            Tab("Code", systemImage: "chevron.left.forwardslash.chevron.right") {
                NavigationStack {
                    SessionsListView(mode: .code)
                }
            }

            Tab("Settings", systemImage: "gear") {
                NavigationStack {
                    SettingsView()
                }
            }
        }
    }
}
