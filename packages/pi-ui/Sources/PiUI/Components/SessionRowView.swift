//
//  SessionRowView.swift
//  PiUI
//
//  Shared session row component for sidebar/list views
//

import SwiftUI

public struct SessionRowView: View {
    public let name: String
    public let repoName: String
    public let lastActivity: Date?

    public init(name: String, repoName: String, lastActivity: Date? = nil) {
        self.name = name
        self.repoName = repoName
        self.lastActivity = lastActivity
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(name)
                .font(.body)
                .fontWeight(.medium)
                .foregroundStyle(.primary)
                .lineLimit(2)

            HStack {
                Text(repoName)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let lastActivity {
                    Spacer()
                    Text(lastActivity, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Previews

#Preview("Standard") {
    SessionRowView(
        name: "Add CI checks for builds and packages",
        repoName: "aliou/pi-apps"
    )
    .padding(.horizontal, 20)
}

#Preview("With Date") {
    SessionRowView(
        name: "Add CI checks for builds and packages",
        repoName: "aliou/pi-apps",
        lastActivity: Date().addingTimeInterval(-3600)
    )
    .padding(.horizontal, 20)
}

#Preview("Long Title") {
    SessionRowView(
        name: "Create evidence extension for documentation with comprehensive testing and validation",
        repoName: "aliou/pi-extensions",
        lastActivity: Date().addingTimeInterval(-86400)
    )
    .padding(.horizontal, 20)
}

#Preview("Multiple Rows") {
    List {
        SessionRowView(
            name: "Create evidence extension for docume...",
            repoName: "aliou/pi-extensions",
            lastActivity: Date().addingTimeInterval(-3600)
        )
        SessionRowView(
            name: "Add CI checks for builds and packages",
            repoName: "aliou/pi-apps",
            lastActivity: Date().addingTimeInterval(-7200)
        )
        SessionRowView(
            name: "Create Pi-hole service in Docker",
            repoName: "378labs/homelab",
            lastActivity: Date().addingTimeInterval(-86400)
        )
    }
}

#Preview("Dark Mode") {
    List {
        SessionRowView(
            name: "Add CI checks for builds and packages",
            repoName: "aliou/pi-apps",
            lastActivity: Date()
        )
        SessionRowView(
            name: "Create Pi-hole service in Docker",
            repoName: "378labs/homelab"
        )
    }
    .preferredColorScheme(.dark)
}
