//
//  RepoSelectorSheet.swift
//  Pi
//
//  Sheet for selecting a GitHub repository, grouped by org with recents.
//

import SwiftUI

struct RepoSelectorSheet: View {
    let repos: [RepoInfo]
    let recentRepoIds: [String]
    let onSelect: (RepoInfo) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            List {
                if !recentRepos.isEmpty && searchText.isEmpty {
                    Section("Recent") {
                        ForEach(recentRepos, id: \.id) { repo in
                            RepoRow(repo: repo) {
                                onSelect(repo)
                                dismiss()
                            }
                        }
                    }
                }

                ForEach(groupedRepos, id: \.0) { org, orgRepos in
                    Section(org) {
                        ForEach(orgRepos, id: \.id) { repo in
                            RepoRow(repo: repo) {
                                onSelect(repo)
                                dismiss()
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search repositories")
            .navigationTitle("Select Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .overlay {
                if filteredRepos.isEmpty && !searchText.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
        }
    }

    private var recentRepos: [RepoInfo] {
        recentRepoIds.prefix(5).compactMap { id in
            repos.first { $0.id == id }
        }
    }

    private var filteredRepos: [RepoInfo] {
        if searchText.isEmpty {
            return repos
        }
        return repos.filter {
            repoDisplayName($0).localizedCaseInsensitiveContains(searchText)
        }
    }

    private var groupedRepos: [(String, [RepoInfo])] {
        let grouped = Dictionary(grouping: filteredRepos) { repoOrgName($0) }
        return grouped.keys.sorted().map { org in
            let orgRepos = grouped[org]?.sorted { repoDisplayName($0) < repoDisplayName($1) } ?? []
            return (org, orgRepos)
        }
    }

    private func repoOrgName(_ repo: RepoInfo) -> String {
        if let owner = repo.owner, !owner.isEmpty {
            return owner
        }
        if let fullName = repo.fullName,
           let slashIndex = fullName.firstIndex(of: "/") {
            return String(fullName[..<slashIndex])
        }
        return "Other"
    }

    private func repoDisplayName(_ repo: RepoInfo) -> String {
        if let fullName = repo.fullName, !fullName.isEmpty {
            return fullName
        }
        return repo.name
    }
}

struct RepoRow: View {
    let repo: RepoInfo
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label {
                Text(repo.name)
                    .foregroundStyle(.primary)
            } icon: {
                Image(systemName: "arrow.triangle.branch")
                    .foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sample Data

extension RepoInfo {
    static let sampleRepos: [RepoInfo] = [
        RepoInfo(id: "1", name: "pi-apps", fullName: "aliou/pi-apps", owner: "aliou", `private`: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "2", name: "dotfiles", fullName: "aliou/dotfiles", owner: "aliou", `private`: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "3", name: "claude-code", fullName: "anthropic/claude-code", owner: "anthropic", `private`: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "4", name: "pi-mono", fullName: "mariozechner/pi-mono", owner: "mariozechner", `private`: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil)
    ]

    static let sampleRecentIds = [
        "1",
        "3",
        "4"
    ]
}

// MARK: - Previews

#Preview("Repo Selector") {
    RepoSelectorSheet(
        repos: RepoInfo.sampleRepos,
        recentRepoIds: RepoInfo.sampleRecentIds
    ) { repo in
        print("Selected: \(repo.id)")
    }
}

#Preview("Repo Selector - No Recents") {
    RepoSelectorSheet(
        repos: RepoInfo.sampleRepos,
        recentRepoIds: []
    ) { repo in
        print("Selected: \(repo.id)")
    }
}

#Preview("Repo Selector - Empty") {
    RepoSelectorSheet(
        repos: [],
        recentRepoIds: []
    ) { _ in }
}
