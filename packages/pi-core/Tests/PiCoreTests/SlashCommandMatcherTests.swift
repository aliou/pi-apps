//
//  SlashCommandMatcherTests.swift
//  PiCoreTests
//

import Testing
@testable import PiCore

@Suite("SlashCommandMatcher")
struct SlashCommandMatcherTests {
    private let commands: [SlashCommand] = [
        SlashCommand(name: "model", description: "Switch model", source: .extension),
        SlashCommand(name: "compact", description: "Compact conversation", source: .extension),
        SlashCommand(name: "settings", description: "Open settings", source: .extension),
        SlashCommand(name: "export", description: "Export session", source: .extension),
        SlashCommand(name: "my-prompt", description: "A user prompt", source: .prompt, location: .user),
        SlashCommand(name: "skill-review", description: "Code review skill", source: .skill, location: .project),
        SlashCommand(name: "navigate", description: "Navigate files", source: .extension)
    ]

    @Test("empty query returns all commands")
    func emptyQuery() {
        let result = SlashCommandMatcher.match(query: "", in: commands)
        #expect(result.count == commands.count)
    }

    @Test("exact prefix match ranks highest")
    func prefixMatch() {
        let result = SlashCommandMatcher.match(query: "mod", in: commands)
        #expect(result.first?.name == "model")
    }

    @Test("contains match works")
    func containsMatch() {
        let result = SlashCommandMatcher.match(query: "set", in: commands)
        #expect(result.contains { $0.name == "settings" })
    }

    @Test("fuzzy match works")
    func fuzzyMatch() {
        // "md" matches "model" via m...d subsequence? No, "model" has m-o-d-e-l, so m then d works.
        let result = SlashCommandMatcher.match(query: "md", in: commands)
        #expect(result.contains { $0.name == "model" })
    }

    @Test("no match returns empty")
    func noMatch() {
        let result = SlashCommandMatcher.match(query: "zzz", in: commands)
        #expect(result.isEmpty)
    }

    @Test("prefix matches rank above contains matches")
    func prefixBeforeContains() {
        // "ex" is prefix of "export", not prefix of anything else
        let result = SlashCommandMatcher.match(query: "ex", in: commands)
        #expect(result.first?.name == "export")
    }

    @Test("shorter names preferred within same tier")
    func shorterPreferred() {
        let cmds = [
            SlashCommand(name: "navigate", source: .extension),
            SlashCommand(name: "nav", source: .extension)
        ]
        let result = SlashCommandMatcher.match(query: "nav", in: cmds)
        #expect(result.first?.name == "nav")
    }

    @Test("case insensitive matching")
    func caseInsensitive() {
        let result = SlashCommandMatcher.match(query: "MODEL", in: commands)
        #expect(result.first?.name == "model")
    }
}
