//
//  SlashCommandMatcher.swift
//  PiCore
//
//  Fuzzy matching and ranking for slash commands.
//

import Foundation

public enum SlashCommandMatcher {
    /// Returns commands matching the query, ranked by relevance.
    /// Empty query returns all commands.
    public static func match(
        query: String,
        in commands: [SlashCommand]
    ) -> [SlashCommand] {
        guard !query.isEmpty else {
            return commands
        }

        let lowercaseQuery = query.lowercased()
        var scored: [(command: SlashCommand, score: Int)] = []

        for command in commands {
            let name = command.name.lowercased()

            if name.hasPrefix(lowercaseQuery) {
                // Exact prefix = highest tier
                scored.append((command, 100 - name.count))
            } else if name.contains(lowercaseQuery) {
                // Contains = second tier
                scored.append((command, 50 - name.count))
            } else if Self.fuzzyMatches(query: lowercaseQuery, in: name) {
                // Fuzzy subsequence = third tier
                scored.append((command, 25 - name.count))
            }
        }

        return scored
            .sorted { $0.score > $1.score }
            .map(\.command)
    }

    private static func fuzzyMatches(query: String, in text: String) -> Bool {
        var textIndex = text.startIndex
        for char in query {
            guard let foundIndex = text[textIndex...].firstIndex(of: char) else {
                return false
            }
            textIndex = text.index(after: foundIndex)
        }
        return true
    }
}
