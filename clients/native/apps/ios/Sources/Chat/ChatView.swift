import SwiftUI

struct ChatView: View {
    let sessionId: String

    var body: some View {
        Text("Chat: \(sessionId)")
            .navigationTitle("Chat")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
    }
}
