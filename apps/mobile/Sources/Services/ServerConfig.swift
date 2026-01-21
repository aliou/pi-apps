import Foundation

/// Manages server connection configuration
@MainActor
@Observable
public final class ServerConfig {
    // MARK: - Singleton

    public static let shared = ServerConfig()

    // MARK: - Storage Keys

    private enum Keys {
        static let serverURL = "pi_server_url"
        static let selectedModelId = "selectedModelId"
        static let selectedModelProvider = "selectedModelProvider"
    }

    // MARK: - Published State

    public var serverURL: URL? {
        didSet {
            if let url = serverURL {
                UserDefaults.standard.set(url.absoluteString, forKey: Keys.serverURL)
            } else {
                UserDefaults.standard.removeObject(forKey: Keys.serverURL)
            }
        }
    }

    public var selectedModelId: String? {
        didSet {
            if let id = selectedModelId {
                UserDefaults.standard.set(id, forKey: Keys.selectedModelId)
            } else {
                UserDefaults.standard.removeObject(forKey: Keys.selectedModelId)
            }
        }
    }

    public var selectedModelProvider: String? {
        didSet {
            if let provider = selectedModelProvider {
                UserDefaults.standard.set(provider, forKey: Keys.selectedModelProvider)
            } else {
                UserDefaults.standard.removeObject(forKey: Keys.selectedModelProvider)
            }
        }
    }

    // MARK: - Initialization

    private init() {
        // Load from UserDefaults
        if let urlString = UserDefaults.standard.string(forKey: Keys.serverURL),
           let url = URL(string: urlString) {
            self.serverURL = url
            print("[ServerConfig] URL configured: \(url)")
        } else {
            self.serverURL = nil
            print("[ServerConfig] No URL configured")
        }

        self.selectedModelId = UserDefaults.standard.string(forKey: Keys.selectedModelId)
        self.selectedModelProvider = UserDefaults.standard.string(forKey: Keys.selectedModelProvider)

        if let modelId = selectedModelId, let provider = selectedModelProvider {
            print("[ServerConfig] Stored model: \(provider)/\(modelId)")
        }
    }

    // MARK: - Server URL Methods

    public func setServerURL(_ url: URL) {
        serverURL = url
    }

    public func clearServerURL() {
        serverURL = nil
    }

    // MARK: - Model Methods

    /// Save selected model for persistence
    public func setSelectedModel(provider: String, modelId: String) {
        selectedModelProvider = provider
        selectedModelId = modelId
        print("[ServerConfig] Saved model: \(provider)/\(modelId)")
    }

    /// Clear selected model
    public func clearSelectedModel() {
        selectedModelProvider = nil
        selectedModelId = nil
    }

    // MARK: - Computed Properties

    /// Check if a model was previously selected
    public var hasStoredModel: Bool {
        selectedModelId != nil && selectedModelProvider != nil
    }

    public var isConfigured: Bool {
        serverURL != nil
    }
}
