import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var viewModel: ChatViewModel

    init() {
        let service = LocalEchoChatService()
        self.viewModel = ChatViewModel(service: service)
    }

    func resetSession() {
        viewModel.resetSession()
    }
}
