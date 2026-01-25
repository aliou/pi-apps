//
//  RepoPickerView.swift
//  pi
//
//  macOS-style repo picker for remote code sessions
//

import SwiftUI

struct RepoPickerView: View {
    let repos: [RepoInfo]
    let recentRepoIds: [String]
    let isLoading: Bool
    let error: String?
    let onSelect: (RepoInfo) -> Void
    let onRefresh: () -> Void

    @State private var searchText = ""

    var body: some View {
        VStack(spacing: 0) {
            // Search field
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search repositories...", text: $searchText)
                    .textFieldStyle(.plain)

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button {
                        onRefresh()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .help("Refresh repositories")
                }
            }
            .padding(10)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Error state
            if let error {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text(error)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        onRefresh()
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding()
            }
            // Loading state (initial)
            else if isLoading && repos.isEmpty {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading repositories...")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            // Empty state
            else if filteredRepos.isEmpty && !searchText.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No repositories matching \"\(searchText)\"")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if repos.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "folder")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No repositories available")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            // Repo list
            else {
                List {
                    // Recent repos section
                    if !recentRepos.isEmpty && searchText.isEmpty {
                        Section("Recent") {
                            ForEach(recentRepos, id: \.id) { repo in
                                RepoRowView(repo: repo) {
                                    onSelect(repo)
                                }
                            }
                        }
                    }

                    // Grouped repos
                    ForEach(groupedRepos, id: \.0) { org, orgRepos in
                        Section(org) {
                            ForEach(orgRepos, id: \.id) { repo in
                                RepoRowView(repo: repo) {
                                    onSelect(repo)
                                }
                            }
                        }
                    }
                }
                .listStyle(.sidebar)
            }
        }
    }

    // MARK: - Computed Properties

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

// MARK: - Repo Row

struct RepoRowView: View {
    let repo: RepoInfo
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: "arrow.triangle.branch")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(repo.name)
                        .foregroundStyle(.primary)
                    if let description = repo.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview("With Repos") {
    RepoPickerView(
        repos: RepoInfo.sampleRepos,
        recentRepoIds: RepoInfo.sampleRecentIds,
        isLoading: false,
        error: nil,
        onSelect: { _ in },
        onRefresh: {}
    )
    .frame(width: 300, height: 400)
}

#Preview("Loading") {
    RepoPickerView(
        repos: [],
        recentRepoIds: [],
        isLoading: true,
        error: nil,
        onSelect: { _ in },
        onRefresh: {}
    )
    .frame(width: 300, height: 400)
}

#Preview("Error") {
    RepoPickerView(
        repos: [],
        recentRepoIds: [],
        isLoading: false,
        error: "Failed to connect to server",
        onSelect: { _ in },
        onRefresh: {}
    )
    .frame(width: 300, height: 400)
}

// MARK: - Sample Data (for previews)

extension RepoInfo {
    static let sampleRepos: [RepoInfo] = [
        RepoInfo(id: "1", name: "pi-apps", fullName: "aliou/pi-apps", owner: "aliou", private: nil, description: "Native Apple clients for pi", htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "2", name: "dotfiles", fullName: "aliou/dotfiles", owner: "aliou", private: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "3", name: "claude-code", fullName: "anthropic/claude-code", owner: "anthropic", private: nil, description: "Claude's coding assistant", htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil),
        RepoInfo(id: "4", name: "pi-mono", fullName: "mariozechner/pi-mono", owner: "mariozechner", private: nil, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil, defaultBranch: nil, path: nil)
    ]

    static let sampleRecentIds = ["1", "3", "4"]
}
