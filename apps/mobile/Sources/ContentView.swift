import SwiftUI
import PiCore

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image("PiLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 60, height: 60)
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
