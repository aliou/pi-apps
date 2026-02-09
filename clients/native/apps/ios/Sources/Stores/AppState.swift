import Foundation
import PiCore

@MainActor
@Observable
final class AppState {
    var relayURL: URL {
        didSet {
            UserDefaults.standard.set(relayURL.absoluteString, forKey: "relayURL")
            client = Relay.RelayClient(baseURL: relayURL)
        }
    }

    private(set) var client: Relay.RelayClient

    init() {
        let saved = UserDefaults.standard.string(forKey: "relayURL")
        let url = saved.flatMap(URL.init(string:)) ?? URL(string: "http://localhost:31415")!
        self.relayURL = url
        self.client = Relay.RelayClient(baseURL: url)
    }
}
