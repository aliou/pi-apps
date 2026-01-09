//
//  NewSessionView.swift
//  pi
//
//  New session view with folder picker and prompt input
//

import SwiftUI

struct NewSessionView: View {
    let onStartSession: (_ folderPath: String, _ prompt: String) -> Void

    @State private var selectedFolder: URL?
    @State private var promptText = ""
    @State private var gitRepoRoot: String?
    @State private var errorMessage: String?
    @FocusState private var isPromptFocused: Bool

    private var canSubmit: Bool {
        selectedFolder != nil && gitRepoRoot != nil && !promptText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var relativePath: String? {
        guard let folder = selectedFolder, let root = gitRepoRoot else { return nil }
        let folderPath = folder.path
        if folderPath == root {
            return nil
        }
        var rel = folderPath
        if rel.hasPrefix(root) {
            rel = String(rel.dropFirst(root.count))
        }
        if rel.hasPrefix("/") {
            rel = String(rel.dropFirst())
        }
        return rel
    }

    var body: some View {
        ZStack {
            // Background
            Theme.pageBg
                .ignoresSafeArea()

            // Centered content
            VStack(spacing: 16) {
                // Folder selector
                folderButton

                // Git repo info
                if let root = gitRepoRoot {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.success)
                            .font(.system(size: 12))

                        Text("Git repo: \(URL(fileURLWithPath: root).lastPathComponent)")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)

                        if let rel = relativePath {
                            Text("/ \(rel)")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.dim)
                        }

                        Spacer()
                    }
                    .padding(.horizontal, 4)
                }

                // Error message
                if let error = errorMessage {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.warning)
                            .font(.system(size: 12))

                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.warning)

                        Spacer()
                    }
                    .padding(.horizontal, 4)
                }

                // Prompt input with submit button
                HStack(alignment: .bottom, spacing: 12) {
                    promptEditor
                    submitButton
                }

                // Info text
                Text("Changes will be made in a Git worktree, keeping your working directory clean.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.darkGray)
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
            .frame(maxWidth: 600)
            .padding(.horizontal, 32)
        }
        .onAppear {
            isPromptFocused = true
        }
    }

    // MARK: - Folder Button

    private var folderButton: some View {
        Button(action: selectFolder) {
            HStack(spacing: 8) {
                Image(systemName: "folder.fill")
                    .foregroundStyle(Theme.accent)

                if let folder = selectedFolder {
                    Text(folder.lastPathComponent)
                        .lineLimit(1)
                } else {
                    Text("Select Git repository or folder")
                        .foregroundStyle(Theme.muted)
                }

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(Theme.dim)
            }
            .font(.system(size: 14))
            .foregroundStyle(Theme.text)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Theme.hoverBg)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Theme.selectedBg, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Prompt Editor

    private var promptEditor: some View {
        ZStack(alignment: .topLeading) {
            // Placeholder
            if promptText.isEmpty {
                Text("What would you like to do?")
                    .foregroundStyle(Theme.dim)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .allowsHitTesting(false)
            }

            TextEditor(text: $promptText)
                .font(.system(size: 14))
                .foregroundStyle(Theme.text)
                .scrollContentBackground(.hidden)
                .focused($isPromptFocused)
                .frame(minHeight: 44, maxHeight: 160)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
        }
        .background(Theme.hoverBg)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Theme.selectedBg, lineWidth: 1)
        )
    }

    // MARK: - Submit Button

    private var submitButton: some View {
        Button(action: submit) {
            Image(systemName: "arrow.up")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(canSubmit ? Theme.text : Theme.dim)
                .frame(width: 36, height: 36)
                .background(canSubmit ? Theme.accent : Theme.darkGray)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!canSubmit)
        .keyboardShortcut(.return, modifiers: .command)
    }

    // MARK: - Actions

    private func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.message = "Select a Git repository or folder inside one"
        panel.prompt = "Select"

        if panel.runModal() == .OK, let url = panel.url {
            selectedFolder = url
            errorMessage = nil

            // Check if it's inside a Git repo
            if let root = GitService.findRepoRoot(for: url.path) {
                gitRepoRoot = root
            } else {
                gitRepoRoot = nil
                errorMessage = "Selected folder is not inside a Git repository"
            }
        }
    }

    private func submit() {
        guard let folder = selectedFolder, gitRepoRoot != nil else { return }
        let trimmedPrompt = promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedPrompt.isEmpty else { return }

        onStartSession(folder.path, trimmedPrompt)
    }
}

// MARK: - Color Extension

#Preview("Empty State") {
    NewSessionView { folder, prompt in
        print("Start session: \(folder), \(prompt)")
    }
    .frame(width: 700, height: 500)
}
