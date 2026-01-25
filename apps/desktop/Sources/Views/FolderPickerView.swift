//
//  FolderPickerView.swift
//  pi
//
//  Folder picker for selecting a project directory
//

import SwiftUI
import AppKit

struct FolderPickerView: View {
    @Environment(\.dismiss) private var dismiss
    let onSelect: (String) -> Void

    @State private var selectedPath: String = ""
    @State private var validationError: String?

    var body: some View {
        VStack(spacing: 20) {
            // Header
            VStack(spacing: 8) {
                Image(systemName: "folder.badge.plus")
                    .font(.system(size: 40))
                    .foregroundStyle(.secondary)

                Text("Select Project Folder")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Choose a folder inside a Git repository")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 20)

            // Selected path
            if !selectedPath.isEmpty {
                HStack {
                    Image(systemName: "folder.fill")
                        .foregroundStyle(.secondary)

                    Text(selectedPath)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    Spacer()

                    Button("Change") {
                        showFolderPicker()
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.secondary.opacity(0.1))
                .cornerRadius(8)
            }

            // Error message
            if let error = validationError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                    Text(error)
                        .foregroundColor(.orange)
                }
                .font(.caption)
            }

            // Recent folders
            if !ServerConfig.shared.recentFolders.isEmpty && selectedPath.isEmpty {
                let recentFolders = ServerConfig.shared.recentFolders
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)

                    ForEach(recentFolders, id: \.self) { folder in
                        Button {
                            selectPath(folder)
                        } label: {
                            HStack {
                                Image(systemName: "folder")
                                    .foregroundStyle(.secondary)
                                Text(URL(fileURLWithPath: folder).lastPathComponent)
                                Spacer()
                                Text(folder)
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                                    .lineLimit(1)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Spacer()

            // Actions
            HStack {
                Button("Cancel") {
                    dismiss()
                }
                .keyboardShortcut(.escape)

                Spacer()

                if selectedPath.isEmpty {
                    Button("Choose Folder...") {
                        showFolderPicker()
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("Open") {
                        confirmSelection()
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(validationError != nil)
                    .keyboardShortcut(.return)
                }
            }
        }
        .padding(24)
        .frame(width: 500, height: 400)
    }

    private func showFolderPicker() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.message = "Select a folder in a Git repository"
        panel.prompt = "Select"

        if panel.runModal() == .OK, let url = panel.url {
            selectPath(url.path)
        }
    }

    private func selectPath(_ path: String) {
        selectedPath = path
        validationError = nil

        // Validate it's in a Git repo
        if !GitService.isInsideGitRepo(path) {
            validationError = "This folder is not inside a Git repository"
        }
    }

    private func confirmSelection() {
        guard validationError == nil else { return }

        // Save to recent folders via ServerConfig
        ServerConfig.shared.addRecentFolder(selectedPath)

        onSelect(selectedPath)
        dismiss()
    }
}

// MARK: - Git Service Extension

extension GitService {
    static func isInsideGitRepo(_ path: String) -> Bool {
        findRepoRoot(for: path) != nil
    }
}

// MARK: - Preview

#Preview {
    FolderPickerView { path in
        print("Selected: \(path)")
    }
}
