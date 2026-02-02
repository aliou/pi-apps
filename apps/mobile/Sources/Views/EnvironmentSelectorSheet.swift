//
//  EnvironmentSelectorSheet.swift
//  Pi
//
//  Sheet for selecting an environment for code sessions.
//

import SwiftUI
import PiCore

struct EnvironmentSelectorSheet: View {
    let environments: [RelayEnvironment]
    let onSelect: (RelayEnvironment) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredEnvironments: [RelayEnvironment] {
        if searchText.isEmpty {
            return environments
        }
        return environments.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if environments.isEmpty {
                    ContentUnavailableView(
                        "No Environments",
                        systemImage: "cube.box",
                        description: Text("Create an environment in the dashboard first.")
                    )
                } else if filteredEnvironments.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                } else {
                    List(filteredEnvironments) { environment in
                        EnvironmentRow(environment: environment) {
                            onSelect(environment)
                            dismiss()
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .searchable(text: $searchText, prompt: "Search environments")
            .navigationTitle("Select Environment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct EnvironmentRow: View {
    let environment: RelayEnvironment
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(environment.name)
                            .font(.body)
                            .foregroundStyle(.primary)

                        if environment.isDefault {
                            Text("Default")
                                .font(.caption2)
                                .fontWeight(.medium)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.blue.opacity(0.1))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())
                        }
                    }

                    Text(environment.config.image)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Previews

#Preview("With Environments") {
    EnvironmentSelectorSheet(
        environments: [
            RelayEnvironment(
                id: "1",
                name: "Codex Universal",
                sandboxType: "docker",
                config: EnvironmentConfig(image: "ghcr.io/aliou/pi-sandbox-codex-universal"),
                isDefault: true,
                createdAt: "2026-02-01",
                updatedAt: "2026-02-01"
            ),
            RelayEnvironment(
                id: "2",
                name: "Python Dev",
                sandboxType: "docker",
                config: EnvironmentConfig(image: "ghcr.io/aliou/pi-sandbox-python"),
                isDefault: false,
                createdAt: "2026-02-01",
                updatedAt: "2026-02-01"
            )
        ]
    ) { env in
        print("Selected: \(env.name)")
    }
}

#Preview("Empty") {
    EnvironmentSelectorSheet(environments: []) { _ in }
}
