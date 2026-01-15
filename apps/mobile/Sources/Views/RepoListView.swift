//
//  RepoListView.swift
//  Pi
//
//  View for selecting a repository from available repos
//

import SwiftUI
import PiCore

struct RepoListView: View {
    let client: RPCClient
    let onRepoSelected: (RepoInfo) -> Void

    @State private var repos: [RepoInfo] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
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
        List(repos, id: \.id) { repo in
            Button {
                onRepoSelected(repo)
            } label: {
                repoRow(repo)
            }
            .listRowBackground(Theme.cardBg)
            .listRowSeparatorTint(Theme.borderMuted)
        }
        .listStyle(.plain)
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
                Text(repo.name)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.text)

                Text(repo.path)
                    .font(.caption)
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
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
            repos = try await client.listRepos()
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}

// MARK: - Preview

#Preview("With Repos") {
    NavigationStack {
        RepoListView(
            client: RPCClient(serverURL: URL(string: "ws://localhost:3000")!)
        ) { repo in
            print("Selected: \(repo.name)")
        }
    }
}

#Preview("Empty State") {
    NavigationStack {
        // Preview of empty state - in real use this would show when no repos exist
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
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
        .navigationTitle("Select Repository")
    }
}
