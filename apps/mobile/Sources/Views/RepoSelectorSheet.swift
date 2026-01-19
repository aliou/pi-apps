//
//  RepoSelectorSheet.swift
//  Pi
//
//  A sheet for selecting a repository from available repos with search
//

import SwiftUI
import PiCore
import PiUI

struct RepoSelectorSheet: View {
    let connection: ServerConnection
    let onSelect: (RepoInfo) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var repos: [RepoInfo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var searchText = ""

    // Filter repos based on search
    private var filteredRepos: [RepoInfo] {
        if searchText.isEmpty {
            return repos
        }
        return repos.filter { repo in
            repo.name.localizedCaseInsensitiveContains(searchText) ||
            (repo.fullName?.localizedCaseInsensitiveContains(searchText) ?? false) ||
            (repo.description?.localizedCaseInsensitiveContains(searchText) ?? false) ||
            (repo.owner?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    loadingView
                } else if let error = errorMessage {
                    errorView(error)
                } else if repos.isEmpty {
                    emptyView
                } else {
                    repoListView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.pageBg)
            .navigationTitle("Select Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .task {
            await loadRepos()
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(1.2)
                .tint(Theme.accent)

            Text("Loading repositories...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 24) {
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(Theme.error)

                Text("Failed to Load Repositories")
                    .font(.headline)
                    .foregroundStyle(Theme.text)

                Text(error)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button(action: { Task { await loadRepos() } }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                    Text("Retry")
                        .fontWeight(.semibold)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Theme.accent)
                .foregroundStyle(.white)
                .cornerRadius(8)
            }
        }
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "folder.badge.questionmark")
                .font(.system(size: 48))
                .foregroundStyle(Theme.muted)

            Text("No Repositories Found")
                .font(.headline)
                .foregroundStyle(Theme.text)

            Text("Add a repository to your Pi server to get started")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button(action: { Task { await loadRepos() } }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.clockwise")
                    Text("Refresh")
                }
                .font(.subheadline)
                .foregroundStyle(Theme.accent)
            }
            .padding(.top, 8)
        }
    }

    private var repoListView: some View {
        List {
            if filteredRepos.isEmpty && !searchText.isEmpty {
                // No search results
                ContentUnavailableView.search(text: searchText)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(filteredRepos, id: \.id) { repo in
                    Button {
                        onSelect(repo)
                        dismiss()
                    } label: {
                        repoRow(repo)
                    }
                    .listRowBackground(Theme.cardBg)
                    .listRowSeparatorTint(Theme.borderMuted)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .searchable(text: $searchText, prompt: "Search repositories")
        .refreshable {
            await loadRepos()
        }
    }

    private func repoRow(_ repo: RepoInfo) -> some View {
        HStack(spacing: 12) {
            // Folder icon
            Image(systemName: "folder.fill")
                .font(.title2)
                .foregroundStyle(Theme.accent)
                .frame(width: 32)

            // Repo info
            VStack(alignment: .leading, spacing: 4) {
                Text(repo.fullName ?? repo.name)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.text)

                if let description = repo.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                } else {
                    Text(repo.cloneUrl ?? repo.htmlUrl ?? repo.path ?? "")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer()

            // Chevron indicator
            Image(systemName: "chevron.right")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.muted)
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    // MARK: - Data Loading

    private func loadRepos() async {
        isLoading = true
        errorMessage = nil

        do {
            repos = try await connection.listRepos()
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}

// MARK: - Previews

// Static preview wrapper for design iteration
private struct RepoSelectorPreview: View {
    let repos: [PreviewRepo]
    let isLoading: Bool
    let errorMessage: String?

    @State private var searchText = ""

    struct PreviewRepo: Identifiable {
        let id: String
        let name: String
        let fullName: String
        let path: String
        let description: String?
    }

    private var filteredRepos: [PreviewRepo] {
        if searchText.isEmpty {
            return repos
        }
        return repos.filter { repo in
            repo.name.localizedCaseInsensitiveContains(searchText) ||
            repo.fullName.localizedCaseInsensitiveContains(searchText) ||
            (repo.description?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .tint(Theme.accent)
                        Text("Loading repositories...")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 24) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Theme.error)
                        Text("Failed to Load Repositories")
                            .font(.headline)
                            .foregroundStyle(Theme.text)
                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if repos.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "folder.badge.questionmark")
                            .font(.system(size: 48))
                            .foregroundStyle(Theme.muted)
                        Text("No Repositories Found")
                            .font(.headline)
                            .foregroundStyle(Theme.text)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        if filteredRepos.isEmpty && !searchText.isEmpty {
                            ContentUnavailableView.search(text: searchText)
                                .listRowBackground(Color.clear)
                        } else {
                            ForEach(filteredRepos) { repo in
                                HStack(spacing: 12) {
                                    Image(systemName: "folder.fill")
                                        .font(.title2)
                                        .foregroundStyle(Theme.accent)
                                        .frame(width: 32)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(repo.fullName)
                                            .font(.body)
                                            .fontWeight(.medium)
                                            .foregroundStyle(Theme.text)
                                        if let desc = repo.description {
                                            Text(desc)
                                                .font(.caption)
                                                .foregroundStyle(Theme.textSecondary)
                                                .lineLimit(1)
                                        } else {
                                            Text(repo.path)
                                                .font(.caption)
                                                .foregroundStyle(Theme.textMuted)
                                                .lineLimit(1)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(Theme.muted)
                                }
                                .padding(.vertical, 8)
                                .listRowBackground(Theme.cardBg)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .searchable(text: $searchText, prompt: "Search repositories")
                }
            }
            .background(Theme.pageBg)
            .navigationTitle("Select Repository")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {}
                }
            }
        }
    }
}

#Preview("With Repos") {
    RepoSelectorPreview(
        repos: [
            .init(id: "1", name: "pi-apps", fullName: "aliou/pi-apps", path: "/Users/aliou/code/pi-apps", description: "Native Apple platform clients for pi CLI"),
            .init(id: "2", name: "pi-extensions", fullName: "aliou/pi-extensions", path: "/Users/aliou/code/pi-extensions", description: "Extensions for the pi coding agent"),
            .init(id: "3", name: "homelab", fullName: "378labs/homelab", path: "/Users/aliou/code/homelab", description: nil),
            .init(id: "4", name: "pkgs", fullName: "378labs/pkgs", path: "/Users/aliou/code/pkgs", description: "Custom Nix packages")
        ],
        isLoading: false,
        errorMessage: nil
    )
}

#Preview("Loading") {
    RepoSelectorPreview(
        repos: [],
        isLoading: true,
        errorMessage: nil
    )
}

#Preview("Empty") {
    RepoSelectorPreview(
        repos: [],
        isLoading: false,
        errorMessage: nil
    )
}

#Preview("Error") {
    RepoSelectorPreview(
        repos: [],
        isLoading: false,
        errorMessage: "Connection refused"
    )
}

#Preview("Dark Mode") {
    RepoSelectorPreview(
        repos: [
            .init(id: "1", name: "pi-apps", fullName: "aliou/pi-apps", path: "/Users/aliou/code/pi-apps", description: "Native Apple platform clients"),
            .init(id: "2", name: "homelab", fullName: "378labs/homelab", path: "/Users/aliou/code/homelab", description: nil)
        ],
        isLoading: false,
        errorMessage: nil
    )
    .preferredColorScheme(.dark)
}
