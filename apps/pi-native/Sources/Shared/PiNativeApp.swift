import SwiftUI

@main
struct PiNativeApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
        }
        .commands {
            CommandGroup(after: .appInfo) {
                Button("New Session") {
                    appState.resetSession()
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }
}
