import SwiftUI
import PiCore

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "message.circle.fill")
                    .font(.system(size: 60))
                    .foregroundStyle(Theme.accent)

                Text("Pi")
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Text("iOS app coming soon")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.pageBg)
        }
    }
}

#Preview {
    ContentView()
}
