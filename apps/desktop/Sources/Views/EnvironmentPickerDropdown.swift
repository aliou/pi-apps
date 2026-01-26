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

    @State private var isExpanded = false

    var body: some View {
        FloatingDropdown(
            icon: selectedEnvironment == .local ? "desktopcomputer" : "cloud",
            title: selectedEnvironment.rawValue,
            isPlaceholder: false,
            isExpanded: $isExpanded
        ) {
            // Local option
            DropdownRow(
                "Local",
                icon: "desktopcomputer",
                isSelected: selectedEnvironment == .local
            ) {
                selectedEnvironment = .local
                isExpanded = false
            }

            DropdownDivider()

            // Remote option
            DropdownRow(
                "Remote",
                icon: "cloud",
                isSelected: selectedEnvironment == .remote
            ) {
                if serverConfig.isConfigured {
                    selectedEnvironment = .remote
                    isExpanded = false
                }
            }
            .opacity(serverConfig.isConfigured ? 1 : 0.5)
            .padding(.bottom, 8)
        }
        .help(serverConfig.isConfigured ? "Select environment" : "Configure server in Settings to enable Remote")
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
