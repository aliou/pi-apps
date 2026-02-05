//
//  SlashCommandState.swift
//  PiUI
//
//  Observable state for the slash command overlay.
//

import SwiftUI
import PiCore

@Observable
public final class SlashCommandState {
    public var isShowing = false
    public var query = ""
    public var highlightedIndex = 0
    public var filteredCommands: [SlashCommand] = []

    private var commands: [SlashCommand] = []

    public init() {}

    /// Update available commands from get_commands RPC
    public func setCommands(_ commands: [SlashCommand]) {
        self.commands = commands
        if isShowing {
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands)
            highlightedIndex = min(highlightedIndex, max(0, filteredCommands.count - 1))
        }
    }

    /// Call when text changes to update slash command state
    public func update(text: String) {
        if text.hasPrefix("/") {
            query = String(text.dropFirst())
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands)
            isShowing = !filteredCommands.isEmpty
            highlightedIndex = 0
        } else {
            dismiss()
        }
    }

    public func moveUp() {
        guard isShowing else { return }
        highlightedIndex = max(0, highlightedIndex - 1)
    }

    public func moveDown() {
        guard isShowing else { return }
        highlightedIndex = min(filteredCommands.count - 1, highlightedIndex + 1)
    }

    public func selectedCommand() -> SlashCommand? {
        guard isShowing, highlightedIndex < filteredCommands.count else { return nil }
        return filteredCommands[highlightedIndex]
    }

    public func dismiss() {
        isShowing = false
        query = ""
        highlightedIndex = 0
        filteredCommands = []
    }
}
