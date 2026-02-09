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

    init(relayURL: URL) {
        self.relayURL = relayURL
        self.client = Relay.RelayClient(baseURL: relayURL)
        UserDefaults.standard.set(relayURL.absoluteString, forKey: "relayURL")
    }

    /// Returns the saved relay URL if one has been configured, nil otherwise.
    static var savedURL: URL? {
        UserDefaults.standard.string(forKey: "relayURL").flatMap(URL.init(string:))
    }
}
