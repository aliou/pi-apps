import SwiftUI
import PiCore

struct SessionRowView: View {
    let title: String
    let repoName: String

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .lineLimit(1)
                Text(repoName)
                    .font(.subheadline)
                    .foregroundStyle(Theme.textMuted)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.dim)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Previews

#Preview("Standard") {
    SessionRowView(
        title: "Add CI checks for builds and packages",
        repoName: "aliou/pi-apps"
    )
    .padding(.horizontal, 20)
    .background(Theme.sidebarBg)
}

#Preview("Long Title") {
    SessionRowView(
        title: "Create evidence extension for documentation with comprehensive testing and validation",
        repoName: "aliou/pi-extensions"
    )
    .padding(.horizontal, 20)
    .background(Theme.sidebarBg)
}

#Preview("Multiple Rows") {
    VStack(spacing: 0) {
        SessionRowView(
            title: "Create evidence extension for docume...",
            repoName: "aliou/pi-extensions"
        )
        Divider()
        SessionRowView(
            title: "Add CI checks for builds and packages",
            repoName: "aliou/pi-apps"
        )
        Divider()
        SessionRowView(
            title: "Create Pi-hole service in Docker with P...",
            repoName: "378labs/homelab"
        )
        Divider()
        SessionRowView(
            title: "Vendor coding agent session search",
            repoName: "378labs/pkgs"
        )
    }
    .padding(.horizontal, 20)
    .background(Theme.sidebarBg)
}

#Preview("Dark Mode") {
    VStack(spacing: 0) {
        SessionRowView(
            title: "Add CI checks for builds and packages",
            repoName: "aliou/pi-apps"
        )
        Divider()
        SessionRowView(
            title: "Create Pi-hole service in Docker",
            repoName: "378labs/homelab"
        )
    }
    .padding(.horizontal, 20)
    .background(Theme.sidebarBg)
    .preferredColorScheme(.dark)
}
