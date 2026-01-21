import Foundation

enum RecentSelections {
    private enum Keys {
        static let recentModelIds = "recentModelIds"
        static let recentRepoIds = "recentRepoIds"
    }

    private static let maxRecentItems = 10

    static func loadRecentModelIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: Keys.recentModelIds) ?? []
    }

    static func addRecentModelId(_ id: String) {
        var ids = loadRecentModelIds()
        ids.removeAll { $0 == id }
        ids.insert(id, at: 0)
        if ids.count > maxRecentItems {
            ids = Array(ids.prefix(maxRecentItems))
        }
        UserDefaults.standard.set(ids, forKey: Keys.recentModelIds)
    }

    static func loadRecentRepoIds() -> [String] {
        UserDefaults.standard.stringArray(forKey: Keys.recentRepoIds) ?? []
    }

    static func addRecentRepoId(_ id: String) {
        var ids = loadRecentRepoIds()
        ids.removeAll { $0 == id }
        ids.insert(id, at: 0)
        if ids.count > maxRecentItems {
            ids = Array(ids.prefix(maxRecentItems))
        }
        UserDefaults.standard.set(ids, forKey: Keys.recentRepoIds)
    }
}
