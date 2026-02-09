import SwiftUI
import PiUI

@main
struct PiNativeApp: App {
    @State private var appState: AppState?

    var body: some Scene {
        WindowGroup {
            if let appState {
                RootView()
                    .environment(appState)
            } else {
                OnboardingView { url in
                    appState = AppState(relayURL: url)
                }
            }
        }
    }

    init() {
        if let savedURL = AppState.savedURL {
            _appState = State(initialValue: AppState(relayURL: savedURL))
        }
    }
}
