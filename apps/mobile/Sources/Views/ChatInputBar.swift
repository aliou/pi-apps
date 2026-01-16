//
//  ChatInputBar.swift
//  pi-mobile
//
//  Floating input bar for chat interface - Claude mobile inspired
//

import SwiftUI
import PiCore

struct ChatInputBar: View {
    @Binding var text: String
    let repoName: String?  // e.g. "aliou/pi-apps", shown as chip
    let isProcessing: Bool
    let canSelectModel: Bool
    let onSend: () -> Void
    let onAbort: () -> Void
    let onRepoTap: () -> Void  // to change repo
    let onModelTap: () -> Void  // to change model

    @FocusState private var isFocused: Bool

    // MARK: - Computed Properties

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var repoDisplayName: String {
        if let repoName, !repoName.isEmpty {
            // Show just the repo name without owner for compactness
            if let slashIndex = repoName.lastIndex(of: "/") {
                return String(repoName[repoName.index(after: slashIndex)...])
            }
            return repoName
        }
        return "Select repo"
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Main container
            VStack(spacing: 12) {
                // Text input area
                textInputField

                // Bottom action row
                actionRow
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Theme.cardBg)
            .cornerRadius(24)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Theme.borderMuted.opacity(0.5), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.08), radius: 8, x: 0, y: 2)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Text Input

    private var textInputField: some View {
        TextField("Message...", text: $text, axis: .vertical)
            .textFieldStyle(.plain)
            .font(.body)
            .foregroundColor(Theme.text)
            .focused($isFocused)
            .lineLimit(1...6)
            .frame(minHeight: 24)
    }

    // MARK: - Action Row

    private var actionRow: some View {
        HStack(spacing: 8) {
            // Repo chip (left side)
            repoChip

            Spacer()

            // Right side buttons
            HStack(spacing: 12) {
                // Attachment button (disabled placeholder)
                attachmentButton

                // Model/Settings button
                modelButton

                // Send or Stop button
                if isProcessing {
                    stopButton
                } else {
                    sendButton
                }
            }
        }
    }

    // MARK: - Repo Chip

    private var repoChip: some View {
        Button(action: onRepoTap) {
            HStack(spacing: 6) {
                Image(systemName: "folder.fill")
                    .font(.system(size: 11, weight: .medium))

                Text(repoDisplayName)
                    .font(.system(size: 13, weight: .medium))
                    .lineLimit(1)

                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .foregroundColor(repoName != nil ? Theme.text : Theme.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule()
                    .fill(Theme.hoverBg)
            )
            .overlay(
                Capsule()
                    .stroke(Theme.borderMuted.opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Action Buttons

    private var attachmentButton: some View {
        Button(action: {
            // Future: attachment functionality
        }) {
            Image(systemName: "plus")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Theme.dim)
                .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .disabled(true)
        .opacity(0.5)
    }

    private var modelButton: some View {
        Button(action: onModelTap) {
            Image(systemName: "gearshape")
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Theme.muted)
                .frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .disabled(!canSelectModel)
        .opacity(canSelectModel ? 1 : 0.4)
    }

    private var sendButton: some View {
        Button(action: onSend) {
            ZStack {
                Circle()
                    .fill(canSend ? sendButtonColor : Theme.dim.opacity(0.3))
                    .frame(width: 32, height: 32)

                Image(systemName: "arrow.up")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(.plain)
        .disabled(!canSend)
    }

    private var stopButton: some View {
        Button(action: onAbort) {
            ZStack {
                Circle()
                    .fill(Theme.error)
                    .frame(width: 32, height: 32)

                Image(systemName: "stop.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Colors

    /// Orange accent color for send button (Claude-style)
    private var sendButtonColor: Color {
        Color(red: 0.92, green: 0.55, blue: 0.25)  // Claude orange
    }
}

// MARK: - Preview

#Preview("Empty State") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack {
            Spacer()
            ChatInputBar(
                text: .constant(""),
                repoName: nil,
                isProcessing: false,
                canSelectModel: false,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
}

#Preview("With Repo") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack {
            Spacer()
            ChatInputBar(
                text: .constant("Can you help me refactor the auth module?"),
                repoName: "aliou/pi-apps",
                isProcessing: false,
                canSelectModel: true,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
}

#Preview("Processing") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack {
            Spacer()
            ChatInputBar(
                text: .constant(""),
                repoName: "anthropic/claude",
                isProcessing: true,
                canSelectModel: true,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
}

#Preview("Dark Mode") {
    ZStack {
        Theme.pageBg.ignoresSafeArea()

        VStack {
            Spacer()
            ChatInputBar(
                text: .constant("Hello, how are you?"),
                repoName: "facebook/react",
                isProcessing: false,
                canSelectModel: true,
                onSend: {},
                onAbort: {},
                onRepoTap: {},
                onModelTap: {}
            )
        }
    }
    .preferredColorScheme(.dark)
}
