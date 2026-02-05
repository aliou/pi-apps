//
//  SlashCommandListView.swift
//  PiUI
//
//  Floating command list shown when user types "/" in input.
//

import SwiftUI
import PiCore

public struct SlashCommandListView: View {
    let commands: [SlashCommand]
    let highlightedIndex: Int
    let onSelect: (SlashCommand) -> Void

    public init(
        commands: [SlashCommand],
        highlightedIndex: Int,
        onSelect: @escaping (SlashCommand) -> Void
    ) {
        self.commands = commands
        self.highlightedIndex = highlightedIndex
        self.onSelect = onSelect
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, command in
                        SlashCommandRow(
                            command: command,
                            isHighlighted: index == highlightedIndex
                        )
                        .id(command.id)
                        .onTapGesture {
                            onSelect(command)
                        }
                    }
                }
                .padding(8)
            }
            .frame(maxHeight: 220)
            .onChange(of: highlightedIndex) { _, newIndex in
                guard newIndex < commands.count else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo(commands[newIndex].id, anchor: .center)
                }
            }
        }
        .background(Theme.inputBg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 8, y: -4)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Theme.borderMuted, lineWidth: 1)
        )
    }
}

// MARK: - Row

private struct SlashCommandRow: View {
    let command: SlashCommand
    let isHighlighted: Bool

    private var icon: String {
        switch command.source {
        case .extension:
            return "puzzlepiece.extension"
        case .prompt:
            return "doc.text"
        case .skill:
            return "sparkles"
        }
    }

    private var locationIcon: String? {
        guard let location = command.location else { return nil }
        switch location {
        case .user:
            return "person.circle"
        case .project:
            return "folder"
        case .path:
            return "externaldrive"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(isHighlighted ? Theme.accent : Theme.textSecondary)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text("/\(command.name)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.text)

                if let description = command.description {
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }

                HStack(spacing: 4) {
                    Text(verbatim: command.source.rawValue.capitalized)
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textMuted)

                    if let locIcon = locationIcon {
                        Image(systemName: locIcon)
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.textMuted)
                    }
                }
            }

            Spacer()

            if isHighlighted {
                Text("return")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.hoverBg)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(isHighlighted ? Theme.selectedBg : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
    }
}

// MARK: - Preview

#Preview {
    VStack {
        Spacer()
        SlashCommandListView(
            commands: [
                SlashCommand(name: "model", description: "Switch the active model", source: .extension),
                SlashCommand(name: "compact", description: "Compact the conversation", source: .extension),
                SlashCommand(name: "my-prompt", description: "A user prompt template", source: .prompt, location: .user),
                SlashCommand(name: "review-skill", description: "Code review skill", source: .skill, location: .project)
            ],
            highlightedIndex: 0
        ) { _ in
        }
        .padding()
    }
    .frame(width: 400, height: 400)
    .background(Theme.pageBg)
}
