import Foundation
import SwiftUI

/// Manages server connection configuration
@MainActor
class ServerConfig: ObservableObject {
    static let shared = ServerConfig()

    private let urlKey = "pi_server_url"

    @Published var serverURL: URL?

    // Model persistence via AppStorage
    @AppStorage("selectedModelId") var selectedModelId: String?
    @AppStorage("selectedModelProvider") var selectedModelProvider: String?

    private init() {
        let urlString = UserDefaults.standard.string(forKey: urlKey)
        print("[ServerConfig] init - urlKey=\(urlKey), urlString=\(urlString ?? "nil")")
        if let urlString, let url = URL(string: urlString) {
            self.serverURL = url
            print("[ServerConfig] URL configured: \(url)")
        } else {
            print("[ServerConfig] No URL configured")
        }

        if let modelId = selectedModelId, let provider = selectedModelProvider {
            print("[ServerConfig] Stored model: \(provider)/\(modelId)")
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

    /// Save selected model for persistence
    func setSelectedModel(provider: String, modelId: String) {
        selectedModelProvider = provider
        selectedModelId = modelId
        print("[ServerConfig] Saved model: \(provider)/\(modelId)")
    }

    /// Clear selected model
    func clearSelectedModel() {
        selectedModelProvider = nil
        selectedModelId = nil
    }

    /// Check if a model was previously selected
    var hasStoredModel: Bool {
        selectedModelId != nil && selectedModelProvider != nil
    }

    var isConfigured: Bool {
        serverURL != nil
    }
}
