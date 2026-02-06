import PiCore
import SwiftUI

@main
struct PiNativeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        Text("Pi \(PiCore.piVersion)")
    }
}
