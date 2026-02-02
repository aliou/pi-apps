//
//  EnvironmentPickerDropdown.swift
//  pi
//
//  Dropdown for selecting Local environment or a remote RelayEnvironment
//

import SwiftUI
import PiCore

// MARK: - Selection Type

/// Unified environment selection: local machine or a specific remote environment.
enum SessionEnvironmentSelection: Sendable, Equatable, Hashable, Identifiable {
    case local
    case remote(RelayEnvironment)

    var id: String {
        switch self {
        case .local: return "local"
        case .remote(let env): return "remote:\(env.id)"
        }
    }

    var isLocal: Bool {
        if case .local = self { return true }
        return false
    }

    var isRemote: Bool {
        if case .remote = self { return true }
        return false
    }

    var relayEnvironment: RelayEnvironment? {
        if case .remote(let env) = self { return env }
        return nil
    }

    var displayName: String {
        switch self {
        case .local: return "Local"
        case .remote(let env): return env.name
        }
    }

    var icon: String {
        switch self {
        case .local: return "desktopcomputer"
        case .remote: return "cloud"
        }
    }
}

// MARK: - Dropdown View

struct EnvironmentPickerDropdown: View {
    @Binding var selection: SessionEnvironmentSelection

    let environments: [RelayEnvironment]
    let isLoading: Bool
    let error: String?
    let serverConfigured: Bool
    let onRefresh: () -> Void

    @State private var isExpanded = false

    var body: some View {
        FloatingDropdown(
            icon: selection.icon,
            title: selection.displayName,
            isPlaceholder: false,
            isExpanded: $isExpanded
        ) {
            VStack(spacing: 0) {
                // Local option
                DropdownRow(
                    "Local",
                    icon: "desktopcomputer",
                    isSelected: selection.isLocal
                ) {
                    selection = .local
                    isExpanded = false
                }

                DropdownDivider()

                // Remote environments section
                if !serverConfigured {
                    notConfiguredView
                } else if isLoading && environments.isEmpty {
                    loadingView
                } else if let error, environments.isEmpty {
                    errorView(error)
                } else if environments.isEmpty {
                    emptyView
                } else {
                    environmentList
                }
            }
        }
    }

    // MARK: - Content Views

    private var notConfiguredView: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "network.slash")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text("Configure a server in Settings to use remote environments.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 14)
            Spacer()
        }
        .padding(.bottom, 8)
    }

    private var loadingView: some View {
        HStack {
            Spacer()
            VStack(spacing: 12) {
                ProgressView()
                Text("Loading environments...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 20)
            Spacer()
        }
        .padding(.bottom, 8)
    }

    private func errorView(_ error: String) -> some View {
        HStack {
            Spacer()
            VStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Retry") { onRefresh() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 14)
            Spacer()
        }
        .padding(.bottom, 8)
    }

    private var emptyView: some View {
        HStack {
            Spacer()
            VStack(spacing: 8) {
                Image(systemName: "cube.box")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                Text("No remote environments configured.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Text("Create one in the relay dashboard.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Button("Refresh") { onRefresh() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 14)
            Spacer()
        }
        .padding(.bottom, 8)
    }

    private var environmentList: some View {
        VStack(spacing: 0) {
            DropdownSection("Remote Environments") {
                // Default environments first, then sorted by name
                let sorted = environments.sorted { lhs, rhs in
                    if lhs.isDefault != rhs.isDefault { return lhs.isDefault }
                    return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
                }

                ForEach(sorted) { env in
                    DropdownRow(
                        env.name,
                        subtitle: env.config.image,
                        icon: "cube.box",
                        isSelected: selection == .remote(env)
                    ) {
                        selection = .remote(env)
                        isExpanded = false
                    }
                }
            }
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Previews

#Preview("Local Selected") {
    EnvironmentPickerDropdown(
        selection: .constant(.local),
        environments: [
            RelayEnvironment(
                id: "1", name: "Codex Universal", sandboxType: "docker",
                config: EnvironmentConfig(image: "ghcr.io/aliou/pi-sandbox-codex-universal"),
                isDefault: true, createdAt: "2026-02-01", updatedAt: "2026-02-01"
            ),
            RelayEnvironment(
                id: "2", name: "Python Dev", sandboxType: "docker",
                config: EnvironmentConfig(image: "ghcr.io/aliou/pi-sandbox-python"),
                isDefault: false, createdAt: "2026-02-01", updatedAt: "2026-02-01"
            )
        ],
        isLoading: false,
        error: nil,
        serverConfigured: true
    ) {}
    .frame(width: 280)
    .padding()
}

#Preview("Remote Selected") {
    let env = RelayEnvironment(
        id: "1", name: "Codex Universal", sandboxType: "docker",
        config: EnvironmentConfig(image: "ghcr.io/aliou/pi-sandbox-codex-universal"),
        isDefault: true, createdAt: "2026-02-01", updatedAt: "2026-02-01"
    )
    EnvironmentPickerDropdown(
        selection: .constant(.remote(env)),
        environments: [env],
        isLoading: false,
        error: nil,
        serverConfigured: true
    ) {}
    .frame(width: 280)
    .padding()
}

#Preview("Loading") {
    EnvironmentPickerDropdown(
        selection: .constant(.local),
        environments: [],
        isLoading: true,
        error: nil,
        serverConfigured: true
    ) {}
    .frame(width: 280)
    .padding()
}

#Preview("Not Configured") {
    EnvironmentPickerDropdown(
        selection: .constant(.local),
        environments: [],
        isLoading: false,
        error: nil,
        serverConfigured: false
    ) {}
    .frame(width: 280)
    .padding()
}
