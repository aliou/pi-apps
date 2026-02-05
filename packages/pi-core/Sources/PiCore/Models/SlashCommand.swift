//
//  SlashCommand.swift
//  PiCore
//
//  SwiftUI-friendly wrapper around RPC SlashCommandInfo.
//

import Foundation

/// A slash command from Pi
public struct SlashCommand: Identifiable, Codable, Sendable, Hashable {
    public let name: String
    public let description: String?
    public let source: SlashCommandSource
    public let location: SlashCommandLocation?
    public let path: String?

    public var id: String { name }

    public init(
        name: String,
        description: String? = nil,
        source: SlashCommandSource = .extension,
        location: SlashCommandLocation? = nil,
        path: String? = nil
    ) {
        self.name = name
        self.description = description
        self.source = source
        self.location = location
        self.path = path
    }

    /// Initialize from RPC SlashCommandInfo
    public init(from info: SlashCommandInfo) {
        self.name = info.name
        self.description = info.description
        self.source = info.source
        self.location = info.location
        self.path = info.path
    }
}
