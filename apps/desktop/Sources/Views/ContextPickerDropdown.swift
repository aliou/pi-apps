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

    @State private var isExpanded = false

    var body: some View {
        if environment == .local {
            localFolderDropdown
        } else {
            remoteRepoDropdown
        }
    }

    // MARK: - Local Folder Dropdown

    private var localFolderDropdown: some View {
        FloatingDropdown(
            icon: "folder",
            title: localTitle,
            isPlaceholder: selectedFolderPath == nil,
            isExpanded: $isExpanded
        ) {
            VStack(spacing: 0) {
                if !recentFolders.isEmpty {
                    DropdownSection("Recent") {
                        ForEach(recentFolders.prefix(5), id: \.self) { folder in
                            DropdownRow(
                                folderDisplayName(folder),
                                subtitle: folder,
                                icon: "folder",
                                isSelected: selectedFolderPath == folder
                            ) {
                                selectedFolderPath = folder
                                onSelectFolder(folder)
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    isExpanded = false
                                }
                            }
                        }
                    }

                    DropdownDivider()
                }

                DropdownRow("Choose a different folder", icon: "folder.badge.plus") {
                    isExpanded = false
                    onChooseDifferentFolder()
                }
            }
            .padding(.bottom, 8)
        }
    }

    // MARK: - Remote Repo Dropdown

    private var remoteRepoDropdown: some View {
        FloatingDropdown(
            icon: "chevron.left.forwardslash.chevron.right",
            title: remoteTitle,
            isPlaceholder: selectedRepo == nil,
            isExpanded: $isExpanded
        ) {
            VStack(spacing: 0) {
                if isLoadingRepos && repos.isEmpty {
                    loadingView
                } else if let error = repoError {
                    errorView(error)
                } else if repos.isEmpty {
                    emptyView
                } else {
                    repoListContent
                }
            }
        }
    }

    // MARK: - Repo Content Views

    private var loadingView: some View {
        HStack {
            Spacer()
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading repositories...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 24)
            Spacer()
        }
    }

    private func errorView(_ error: String) -> some View {
        HStack {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    onRefreshRepos()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(.vertical, 24)
            .padding(.horizontal, 14)
            Spacer()
        }
    }

    private var emptyView: some View {
        HStack {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "folder")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("No repositories available")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 24)
            Spacer()
        }
    }

    private var repoListContent: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Recently Used
                if !recentRepos.isEmpty {
                    DropdownSection("Recently Used") {
                        ForEach(recentRepos, id: \.id) { repo in
                            repoRow(repo)
                        }
                    }

                    DropdownDivider()
                }

                // All Repositories
                DropdownSection("All Repositories") {
                    ForEach(repos.sorted { $0.name.lowercased() < $1.name.lowercased() }, id: \.id) { repo in
                        repoRow(repo)
                    }
                }

                DropdownFooter(
                    "Repo missing? Install the GitHub app to access private repos.",
                    buttonTitle: "Install GitHub App",
                    buttonIcon: "arrow.up.right"
                ) {
                    // TODO: Open GitHub app install URL
                }
            }
        }
        .frame(maxHeight: 280)
    }

    private func repoRow(_ repo: RepoInfo) -> some View {
        DropdownRow(
            repo.name,
            subtitle: repo.owner,
            isSelected: selectedRepo?.id == repo.id
        ) {
            selectedRepo = repo
            onSelectRepo(repo)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isExpanded = false
            }
        }
    }

    // MARK: - Computed Properties

    private var localTitle: String {
        if let path = selectedFolderPath {
            return URL(fileURLWithPath: path).lastPathComponent
        }
        return "Select folder"
    }

    private var remoteTitle: String {
        if let repo = selectedRepo {
            return repo.name
        }
        return "Select repository"
    }

    private var recentRepos: [RepoInfo] {
        recentRepoIds.prefix(5).compactMap { id in
            repos.first { $0.id == id }
        }
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
    .frame(width: 320)
    .padding()
}

#Preview("Local - With Selection") {
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
        selectedFolderPath: .constant("/Users/dev/projects/my-app"),
        selectedRepo: .constant(nil)
    )
    .frame(width: 320)
    .padding()
}

#Preview("Remote - With Repos") {
    ContextPickerDropdown(
        mode: .code,
        environment: .remote,
        recentFolders: [],
        onSelectFolder: { _ in },
        onChooseDifferentFolder: {},
        repos: [
            RepoInfo(
                id: "1", name: "pi-apps", fullName: "aliou/pi-apps", owner: "aliou",
                private: false, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil,
                defaultBranch: "main", path: nil
            ),
            RepoInfo(
                id: "2", name: "canvas", fullName: "378labs/canvas", owner: "378labs",
                private: false, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil,
                defaultBranch: "main", path: nil
            ),
            RepoInfo(
                id: "3", name: "catchup", fullName: "378labs/catchup", owner: "378labs",
                private: false, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil,
                defaultBranch: "main", path: nil
            ),
            RepoInfo(
                id: "4", name: "dotfiles", fullName: "aliou/dotfiles", owner: "aliou",
                private: false, description: nil, htmlUrl: nil, cloneUrl: nil, sshUrl: nil,
                defaultBranch: "main", path: nil
            )
        ],
        recentRepoIds: ["1", "2"],
        isLoadingRepos: false,
        repoError: nil,
        onSelectRepo: { _ in },
        onRefreshRepos: {},
        selectedFolderPath: .constant(nil),
        selectedRepo: .constant(nil)
    )
    .frame(width: 320)
    .padding()
}

#Preview("Remote - Loading") {
    ContextPickerDropdown(
        mode: .code,
        environment: .remote,
        recentFolders: [],
        onSelectFolder: { _ in },
        onChooseDifferentFolder: {},
        repos: [],
        recentRepoIds: [],
        isLoadingRepos: true,
        repoError: nil,
        onSelectRepo: { _ in },
        onRefreshRepos: {},
        selectedFolderPath: .constant(nil),
        selectedRepo: .constant(nil)
    )
    .frame(width: 320)
    .padding()
}
