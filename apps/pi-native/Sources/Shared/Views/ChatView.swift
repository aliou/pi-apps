import SwiftUI

struct ChatView: View {
    @ObservedObject var viewModel: ChatViewModel
    @State private var scrollTarget: UUID?

    var body: some View {
        VStack(spacing: 16) {
            header
            messageList
            inputBar
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(minWidth: 480, minHeight: 640)
        .background(LinearGradient(colors: [.black, .gray.opacity(0.4)], startPoint: .top, endPoint: .bottom))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Reset") {
                    viewModel.resetSession()
                }
            }
        }
        .onChange(of: viewModel.messages) { _, newValue in
            scrollTarget = newValue.last?.id
        }
    }

    private var header: some View {
        GlassPanel {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Pi Native")
                        .font(.title2.bold())
                    Text("Session: \(viewModel.session.title)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Label("Live", systemImage: viewModel.isSending ? "sparkles" : "bolt.horizontal")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var messageList: some View {
        GlassPanel {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            MessageRow(message: message)
                                .id(message.id)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onChange(of: scrollTarget) { _, target in
                    guard let target else { return }
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(target, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var inputBar: some View {
        GlassPanel {
            HStack(spacing: 12) {
                TextField("Ask Pi Native", text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...4)

                Button {
                    Task { await viewModel.sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 26))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}
