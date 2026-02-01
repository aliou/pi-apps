//
//  RepoSelectorSheet.swift
//  Pi
//
//  Sheet for selecting a GitHub repository, grouped by org with recents.
//

import SwiftUI
import PiCore

struct RepoSelectorSheet: View {
    let repos: [RepoInfo]
    let recentRepoIds: [Int]
    let onSelect: (RepoInfo) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            List {
                if !recentRepos.isEmpty && searchText.isEmpty {
                    Section("Recent") {
                        ForEach(recentRepos) { repo in
                            RepoRow(repo: repo) {
                                onSelect(repo)
                                dismiss()
                            }
                        }
                    }
                }

                ForEach(groupedRepos, id: \.0) { org, orgRepos in
                    Section(org) {
                        ForEach(orgRepos) { repo in
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
            $0.fullName.localizedCaseInsensitiveContains(searchText) ||
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var groupedRepos: [(String, [RepoInfo])] {
        let grouped = Dictionary(grouping: filteredRepos) { repoOrgName($0) }
        return grouped.keys.sorted().map { org in
            let orgRepos = grouped[org]?.sorted { $0.fullName < $1.fullName } ?? []
            return (org, orgRepos)
        }
    }

    private func repoOrgName(_ repo: RepoInfo) -> String {
        // Extract owner from fullName (format: "owner/repo")
        if let slashIndex = repo.fullName.firstIndex(of: "/") {
            return String(repo.fullName[..<slashIndex])
        }
        return "Other"
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
        RepoInfo(
            id: 1,
            name: "pi-apps",
            fullName: "aliou/pi-apps",
            private: false,
            description: "Native Apple clients for pi"
        ),
        RepoInfo(
            id: 2,
            name: "dotfiles",
            fullName: "aliou/dotfiles",
            private: false,
            description: "Personal configuration files"
        ),
        RepoInfo(
            id: 3,
            name: "claude-code",
            fullName: "anthropic/claude-code",
            private: false,
            description: "Claude Code by Anthropic"
        ),
        RepoInfo(
            id: 4,
            name: "pi-mono",
            fullName: "mariozechner/pi-mono",
            private: false,
            description: "Pi coding agent monorepo"
        )
    ]

    static let sampleRecentIds: [Int] = [1, 3, 4]
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
