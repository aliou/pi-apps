import SwiftUI
import PiCore
import PiUI

struct AssistantMessageView: View {
    let message: Client.AssistantMessageItem

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                if message.text.isEmpty && message.isStreaming {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    PiMarkdownView(message.text)
                }

                if message.isStreaming && !message.text.isEmpty {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(.tint)
                            .frame(width: 6, height: 6)
                            .opacity(0.6)
                        Text("Generating...")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer(minLength: 40)
        }
    }
}
