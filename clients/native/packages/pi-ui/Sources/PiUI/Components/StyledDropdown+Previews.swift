#if os(macOS)
import SwiftUI

#Preview("Dropdown Button") {
    struct Preview: View {
        @State private var isExpandedPlaceholder = false
        @State private var isExpandedSelected = false

        var body: some View {
            VStack(spacing: 20) {
                // Placeholder state
                FloatingDropdown(
                    icon: "folder",
                    title: "Select folder",
                    isPlaceholder: true,
                    isExpanded: $isExpandedPlaceholder
                ) {
                    DropdownRow("Placeholder content") {}
                }
                .frame(width: 320)

                // Selected state
                FloatingDropdown(
                    icon: "folder.fill",
                    title: "pi-apps",
                    isPlaceholder: false,
                    isExpanded: $isExpandedSelected
                ) {
                    DropdownRow("Selected content") {}
                }
                .frame(width: 320)
            }
            .padding(40)
        }
    }
    return Preview()
}

#Preview("Dropdown Row Variants") {
    struct Preview: View {
        var body: some View {
            VStack(spacing: 0) {
                DropdownRow("With Icon", icon: "folder") {}

                DropdownRow("With Icon and Subtitle", subtitle: "~/code/pi-apps", icon: "folder") {}

                DropdownRow("With Subtitle Only", subtitle: "Additional info") {}

                DropdownRow("Selected with Icon", icon: "star.fill", isSelected: true) {}

                DropdownRow("Long text that might wrap and should be truncated", icon: "document") {}

                DropdownRow("No Icon", subtitle: "Just a row") {}
            }
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(20)
        }
    }
    return Preview()
}

#Preview("Dropdown Sections") {
    struct Preview: View {
        @State private var isExpanded = false

        var body: some View {
            FloatingDropdown(
                icon: "folder",
                title: "Select folder",
                isPlaceholder: true,
                isExpanded: $isExpanded
            ) {
                DropdownSection("Recent") {
                    DropdownRow("pi-apps", subtitle: "~/code/pi-apps", icon: "folder") {}
                    DropdownRow("my-project", subtitle: "~/code/my-project", icon: "folder") {}
                }

                DropdownDivider()

                DropdownSection("Favorites") {
                    DropdownRow("Desktop", icon: "folder") {}
                    DropdownRow("Documents", icon: "folder") {}
                }

                DropdownDivider()

                DropdownFooter(
                    "Choose a different location",
                    buttonTitle: "Browse",
                    buttonIcon: "folder.badge.plus"
                ) {}
            }
            .frame(width: 320)
            .padding(40)
        }
    }
    return Preview()
}

#Preview("Dropdown with Selection") {
    struct Preview: View {
        @State private var isExpanded = false
        @State private var selectedFolder = "pi-apps"

        var body: some View {
            VStack(spacing: 20) {
                FloatingDropdown(
                    icon: "folder",
                    title: selectedFolder.isEmpty ? "Select folder" : selectedFolder,
                    isPlaceholder: selectedFolder.isEmpty,
                    isExpanded: $isExpanded
                ) {
                    DropdownSection("Recent") {
                        DropdownRow(
                            "pi-apps",
                            subtitle: "~/code/pi-apps",
                            icon: "folder",
                            isSelected: selectedFolder == "pi-apps"
                        ) {
                            selectedFolder = "pi-apps"
                            isExpanded = false
                        }
                        DropdownRow(
                            "my-project",
                            subtitle: "~/code/my-project",
                            icon: "folder",
                            isSelected: selectedFolder == "my-project"
                        ) {
                            selectedFolder = "my-project"
                            isExpanded = false
                        }
                    }

                    DropdownDivider()

                    DropdownRow(
                        "Choose different folder...",
                        icon: "folder.badge.plus"
                    ) {
                        selectedFolder = ""
                        isExpanded = false
                    }
                    .padding(.bottom, 8)
                }
                .frame(width: 320)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Selected: \(selectedFolder.isEmpty ? "None" : selectedFolder)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
                .background(Color.gray.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))

                Spacer()
            }
            .padding(40)
            .frame(height: 500)
        }
    }
    return Preview()
}

#endif
