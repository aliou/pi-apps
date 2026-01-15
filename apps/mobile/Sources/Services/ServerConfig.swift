import Foundation

/// Manages server connection configuration
@MainActor
class ServerConfig: ObservableObject {
    static let shared = ServerConfig()

    private let urlKey = "pi_server_url"

    @Published var serverURL: URL?

    private init() {
        let urlString = UserDefaults.standard.string(forKey: urlKey)
        print("[ServerConfig] init - urlKey=\(urlKey), urlString=\(urlString ?? "nil")")
        if let urlString, let url = URL(string: urlString) {
            self.serverURL = url
            print("[ServerConfig] URL configured: \(url)")
        } else {
            print("[ServerConfig] No URL configured")
        }
    }

    func setServerURL(_ url: URL) {
        serverURL = url
        UserDefaults.standard.set(url.absoluteString, forKey: urlKey)
    }

    func clearServerURL() {
        serverURL = nil
        UserDefaults.standard.removeObject(forKey: urlKey)
    }

    var isConfigured: Bool {
        serverURL != nil
    }
}
