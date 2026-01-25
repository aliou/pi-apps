//
//  ContextPickerDropdown.swift
//  pi
//
//  Left-side dropdown that adapts based on environment.
//  Shows folder picker for Local, repo picker for Remote.
//

import SwiftUI

struct ContextPickerDropdown: View {
    let mode: SidebarMode
    let environment: SessionEnvironment

    // Local mode state
    let recentFolders: [String]
    let onSelectFolder: (String) -> Void
    let onChooseDifferentFolder: () -> Void

    // Remote mode state
    let repos: [RepoInfo]
    let recentRepoIds: [String]
    let isLoadingRepos: Bool
    let repoError: String?
    let onSelectRepo: (RepoInfo) -> Void
    let onRefreshRepos: () -> Void

    // Selection state
    @Binding var selectedFolderPath: String?
    @Binding var selectedRepo: RepoInfo?

    @State private var searchText = ""
    @State private var showRepoPopover = false

    var body: some View {
        dropdownContainer {
            if environment == .local {
                // Local: Use Menu (no search needed)
                Menu {
                    localFolderContent
                } label: {
                    dropdownLabelContent
                }
                .menuStyle(.borderlessButton)
            } else {
                // Remote: Use Button + Popover (for search support)
                Button {
                    showRepoPopover = true
                } label: {
                    dropdownLabelContent
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showRepoPopover, arrowEdge: .bottom) {
                    repoPopoverContent
                        .frame(width: 350, height: 400)
                }
            }
        }
    }

    // MARK: - Dropdown Container

    @ViewBuilder
    private func dropdownContainer<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.15), lineWidth: 1)
            )
    }

    // MARK: - Dropdown Label Content

    @ViewBuilder
    private var dropdownLabelContent: some View {
        HStack {
            Image(systemName: environment == .local ? "folder" : "chevron.left.forwardslash.chevron.right.circle")

            if environment == .local {
                if let path = selectedFolderPath {
                    Text(URL(fileURLWithPath: path).lastPathComponent)
                } else {
                    Text("Select folder")
                        .foregroundStyle(.secondary)
                }
            } else {
                if let repo = selectedRepo {
                    Text(repo.name)
                } else {
                    Text("Select repository")
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
            Image(systemName: "chevron.up.chevron.down")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Local Folder Content

    @ViewBuilder
    private var localFolderContent: some View {
        if !recentFolders.isEmpty {
            Section("Recent") {
                ForEach(recentFolders.prefix(5), id: \.self) { folder in
                    Button {
                        selectedFolderPath = folder
                        onSelectFolder(folder)
                    } label: {
                        HStack {
                            Image(systemName: GitService.isInsideGitRepo(folder) ? "arrow.triangle.branch" : "folder")
                            VStack(alignment: .leading) {
                                Text(folderDisplayName(folder))
                                Text(folder)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Divider()
        }

        Button {
            onChooseDifferentFolder()
        } label: {
            Label("Choose a different folder", systemImage: "plus")
        }
    }

    // MARK: - Repo Popover Content

    @ViewBuilder
    private var repoPopoverContent: some View {
        VStack(spacing: 0) {
            // Search field at top
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search repositories", text: $searchText)
                    .textFieldStyle(.plain)

                if isLoadingRepos {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Button {
                        onRefreshRepos()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .help("Refresh repositories")
                }
            }
            .padding(10)
            .background(Color(NSColor.textBackgroundColor))

            Divider()

            // Content
            if isLoadingRepos && repos.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading repositories...")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else if let error = repoError {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text(error)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        onRefreshRepos()
                    }
                    .buttonStyle(.bordered)
                }
                Spacer()
            } else if filteredRepos.isEmpty && !searchText.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No repositories matching \"\(searchText)\"")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else if repos.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "folder")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No repositories available")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            } else {
                List {
                    // Recently Used
                    if !recentRepos.isEmpty && searchText.isEmpty {
                        Section("Recently Used") {
                            ForEach(recentRepos, id: \.id) { repo in
                                repoRow(repo)
                            }
                        }
                    }

                    // All Repositories (grouped by org)
                    ForEach(groupedRepos, id: \.0) { org, orgRepos in
                        Section(org) {
                            ForEach(orgRepos, id: \.id) { repo in
                                repoRow(repo)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Repo Row

    private func repoRow(_ repo: RepoInfo) -> some View {
        Button {
            selectedRepo = repo
            onSelectRepo(repo)
            showRepoPopover = false
        } label: {
            HStack {
                Image(systemName: "arrow.triangle.branch")
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(repo.name)
                        .foregroundStyle(.primary)
                    if let owner = repo.owner {
                        Text(owner)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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

    private func folderDisplayName(_ path: String) -> String {
        URL(fileURLWithPath: path).lastPathComponent
    }
}

// MARK: - Preview

#Preview("Local - No Selection") {
    ContextPickerDropdown(
        mode: .code,
        environment: .local,
        recentFolders: [
            "/Users/dev/projects/my-app",
            "/Users/dev/projects/another-project"
        ],
        onSelectFolder: { _ in },
        onChooseDifferentFolder: {},
        repos: [],
        recentRepoIds: [],
        isLoadingRepos: false,
        repoError: nil,
        onSelectRepo: { _ in },
        onRefreshRepos: {},
        selectedFolderPath: .constant(nil),
        selectedRepo: .constant(nil)
    )
    .frame(width: 300)
    .padding()
}

#Preview("Local - With Selection") {
    ContextPickerDropdown(
        mode: .code,
        environment: .local,
        recentFolders: [],
        onSelectFolder: { _ in },
        onChooseDifferentFolder: {},
        repos: [],
        recentRepoIds: [],
        isLoadingRepos: false,
        repoError: nil,
        onSelectRepo: { _ in },
        onRefreshRepos: {},
        selectedFolderPath: .constant("/Users/dev/projects/my-app"),
        selectedRepo: .constant(nil)
    )
    .frame(width: 300)
    .padding()
}

#Preview("Remote - No Selection") {
    ContextPickerDropdown(
        mode: .code,
        environment: .remote,
        recentFolders: [],
        onSelectFolder: { _ in },
        onChooseDifferentFolder: {},
        repos: [],
        recentRepoIds: [],
        isLoadingRepos: false,
        repoError: nil,
        onSelectRepo: { _ in },
        onRefreshRepos: {},
        selectedFolderPath: .constant(nil),
        selectedRepo: .constant(nil)
    )
    .frame(width: 300)
    .padding()
}
