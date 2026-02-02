//
//  ContextBar.swift
//  Pi
//
//  Context bar for Code mode showing Environment, Repository, and Branch.
//

import SwiftUI

struct ContextBar: View {
    let environmentName: String?
    let repoName: String?
    let branchName: String?

    let onEnvironmentTap: () -> Void
    let onRepoTap: () -> Void
    let onBranchTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            ContextChip(
                icon: "cube.box",
                title: environmentName ?? "Environment",
                action: onEnvironmentTap
            )

            ContextDivider()

            ContextChip(
                icon: "arrow.triangle.branch",
                title: repoName ?? "Repository",
                action: onRepoTap
            )

            ContextDivider()

            ContextChip(
                icon: "leaf",
                title: branchName ?? "Branch",
                action: onBranchTap
            )
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct ContextChip: View {
    let icon: String
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14))

                Text(title)
                    .font(.subheadline)
                    .lineLimit(1)
            }
            .foregroundStyle(.secondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
    }
}

private struct ContextDivider: View {
    var body: some View {
        Rectangle()
            .fill(.separator)
            .frame(width: 1)
            .padding(.vertical, 8)
    }
}

// MARK: - Previews

#Preview("Context Bar - Full") {
    VStack {
        Spacer()
        ContextBar(
            environmentName: "Codex Universal",
            repoName: "aliou/pi-apps",
            branchName: "main",
            onEnvironmentTap: {},
            onRepoTap: {},
            onBranchTap: {}
        )
    }
    .padding()
}

#Preview("Context Bar - Empty") {
    VStack {
        Spacer()
        ContextBar(
            environmentName: nil,
            repoName: nil,
            branchName: nil,
            onEnvironmentTap: {},
            onRepoTap: {},
            onBranchTap: {}
        )
    }
    .padding()
}

#Preview("Context Bar - Dark") {
    VStack {
        Spacer()
        ContextBar(
            environmentName: nil,
            repoName: "anthropic/claude-code",
            branchName: nil,
            onEnvironmentTap: {},
            onRepoTap: {},
            onBranchTap: {}
        )
    }
    .padding()
    .preferredColorScheme(.dark)
}
