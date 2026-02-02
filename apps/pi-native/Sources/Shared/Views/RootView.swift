import SwiftUI

struct RootView: View {
    @StateObject private var viewModel = ChatViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [Color.blue.opacity(0.25), Color.purple.opacity(0.25), Color.indigo.opacity(0.35)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                VStack(spacing: 16) {
                    header

                    GlassCard {
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 12) {
                                ForEach(viewModel.messages) { message in
                                    MessageRow(message: message)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }

                    composer
                }
                .padding()
            }
            .navigationTitle("Pi Native")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private var header: some View {
        GlassCard {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Liquid Glass Workspace")
                        .font(.title2.weight(.semibold))
                    Text("Status: \(viewModel.statusText)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    viewModel.messages = viewModel.messages.prefix(1).map { $0 }
                    viewModel.statusText = "Ready"
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var composer: some View {
        GlassCard {
            HStack(spacing: 12) {
                TextField("Ask Pi Native to draft, plan, or code…", text: $viewModel.draft, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.thinMaterial)
                    )

                Button {
                    viewModel.send()
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.headline)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }
}
