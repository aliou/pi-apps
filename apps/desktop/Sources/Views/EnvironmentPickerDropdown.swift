//
//  EnvironmentPickerDropdown.swift
//  pi
//
//  Dropdown for selecting Local vs Remote environment
//

import SwiftUI

struct EnvironmentPickerDropdown: View {
    @Binding var selectedEnvironment: SessionEnvironment
    let serverConfig: ServerConfig

    var body: some View {
        dropdownContainer {
            Menu {
                // Local option
                Button {
                    selectedEnvironment = .local
                } label: {
                    HStack {
                        Label("Local", systemImage: "desktopcomputer")
                        if selectedEnvironment == .local {
                            Spacer()
                            Image(systemName: "checkmark")
                        }
                    }
                }

                Divider()

                // Remote option (disabled if not configured)
                Button {
                    selectedEnvironment = .remote
                } label: {
                    HStack {
                        Label("Remote", systemImage: "cloud")
                        if selectedEnvironment == .remote {
                            Spacer()
                            Image(systemName: "checkmark")
                        }
                    }
                }
                .disabled(!serverConfig.isConfigured)
            } label: {
                HStack {
                    Image(systemName: selectedEnvironment == .local ? "desktopcomputer" : "cloud")
                    Text(selectedEnvironment.rawValue)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .menuStyle(.borderlessButton)
        }
        .help(serverConfig.isConfigured ? "Select environment" : "Configure server in Settings to enable Remote")
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
}

// MARK: - Preview

#Preview("Local Selected") {
    EnvironmentPickerDropdown(
        selectedEnvironment: .constant(.local),
        serverConfig: ServerConfig.shared
    )
    .frame(width: 220)
    .padding()
}

#Preview("Remote Selected") {
    EnvironmentPickerDropdown(
        selectedEnvironment: .constant(.remote),
        serverConfig: ServerConfig.shared
    )
    .frame(width: 220)
    .padding()
}
