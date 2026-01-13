import SwiftUI
import PiCore

struct ContentView: View {
    @Environment(\.colorScheme) private var colorScheme
    @State private var showBaitMessage = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image("PiLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 60, height: 60)
                    .foregroundStyle(Theme.accent)
                    .padding(16)
                    .background {
                        if colorScheme == .light {
                            RoundedRectangle(cornerRadius: 16)
                                .fill(Color.black.opacity(0.85))
                        }
                    }

                Text(showBaitMessage ? "Sorry, you just got baited" : "iOS app coming soon")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText())
            }
            .padding(.bottom, 100)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.pageBg)
            .onAppear {
                Task {
                    try? await Task.sleep(for: .seconds(3))
                    withAnimation {
                        showBaitMessage = true
                    }
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
