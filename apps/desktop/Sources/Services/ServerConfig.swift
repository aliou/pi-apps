//
//  ServerConfig.swift
//  pi
//
//  Server configuration storage for remote connections
//

import Foundation

/// Server configuration storage
@MainActor
@Observable
final class ServerConfig {
    static let shared = ServerConfig()

    private let defaults = UserDefaults.standard
    private let serverURLKey = "serverURL"
    private let selectedModelProviderKey = "selectedModelProvider"
    private let selectedModelIdKey = "selectedModelId"
    private let recentRepoIdsKey = "recentRepoIds"

    var serverURL: URL? {
        guard let string = defaults.string(forKey: serverURLKey) else { return nil }
        return URL(string: string)
    }

    var isConfigured: Bool {
        serverURL != nil
    }

    var selectedModelProvider: String? {
        defaults.string(forKey: selectedModelProviderKey)
    }

    var selectedModelId: String? {
        defaults.string(forKey: selectedModelIdKey)
    }

    var recentRepoIds: [String] {
        defaults.stringArray(forKey: recentRepoIdsKey) ?? []
    }

    func setServerURL(_ url: URL) {
        defaults.set(url.absoluteString, forKey: serverURLKey)
    }

    func clearServerURL() {
        defaults.removeObject(forKey: serverURLKey)
    }

    func setSelectedModel(provider: String, modelId: String) {
        defaults.set(provider, forKey: selectedModelProviderKey)
        defaults.set(modelId, forKey: selectedModelIdKey)
    }

    func addRecentRepo(_ repoId: String) {
        var ids = recentRepoIds
        ids.removeAll { $0 == repoId }
        ids.insert(repoId, at: 0)
        if ids.count > 10 {
            ids = Array(ids.prefix(10))
        }
        defaults.set(ids, forKey: recentRepoIdsKey)
    }

    private init() {}
}
