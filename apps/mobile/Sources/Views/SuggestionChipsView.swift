//
//  SuggestionChipsView.swift
//  Pi
//
//  Horizontal scrolling suggestion chips above the input.
//

import SwiftUI

struct Suggestion: Identifiable {
    let id = UUID()
    let title: String
    let subtitle: String?

    init(_ title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
    }
}

struct SuggestionChipsView: View {
    let suggestions: [Suggestion]
    let onSelect: (Suggestion) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(suggestions) { suggestion in
                    SuggestionChip(suggestion: suggestion) {
                        onSelect(suggestion)
                    }
                }
            }
            .padding(.horizontal)
        }
        .mask(fadeGradient)
    }

    /// Fade edges to hint there's more content
    private var fadeGradient: some View {
        HStack(spacing: 0) {
            LinearGradient(
                colors: [.clear, .black],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: 16)

            Color.black

            LinearGradient(
                colors: [.black, .clear],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: 24)
        }
    }
}

struct SuggestionChip: View {
    let suggestion: Suggestion
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 1) {
                Text(suggestion.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                if let subtitle = suggestion.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sample Data

extension Suggestion {
    static let chatSuggestions: [Suggestion] = [
        Suggestion("Tell me", subtitle: "something fascinating"),
        Suggestion("Explain", subtitle: "a complex topic simply"),
        Suggestion("Help me write", subtitle: "a professional email"),
        Suggestion("Brainstorm", subtitle: "ideas for my project")
    ]

    static let codeSuggestions: [Suggestion] = [
        Suggestion("Create or update", subtitle: "my CLAUDE.md file"),
        Suggestion("Search for", subtitle: "TODO comments and fix them"),
        Suggestion("Recommend areas", subtitle: "to improve our tests"),
        Suggestion("Refactor", subtitle: "this function for clarity")
    ]
}

// MARK: - Previews

#Preview("Chat Suggestions") {
    VStack {
        Spacer()
        SuggestionChipsView(suggestions: Suggestion.chatSuggestions) { suggestion in
            print("Selected: \(suggestion.title)")
        }
    }
}

#Preview("Code Suggestions") {
    VStack {
        Spacer()
        SuggestionChipsView(suggestions: Suggestion.codeSuggestions) { suggestion in
            print("Selected: \(suggestion.title)")
        }
    }
    .preferredColorScheme(.dark)
}
