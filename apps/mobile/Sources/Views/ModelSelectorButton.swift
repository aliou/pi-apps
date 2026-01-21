//
//  ModelSelectorButton.swift
//  Pi
//
//  Center tappable text showing current model with dropdown chevron.
//

import SwiftUI

struct ModelSelectorButton: View {
    let modelName: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(displayName)
                    .fontWeight(.medium)
                Image(systemName: "chevron.down")
                    .font(.caption2)
                    .fontWeight(.semibold)
            }
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
    }

    /// Extract short name: "Claude Sonnet 4.5" -> "Sonnet 4.5"
    private var displayName: String {
        guard let modelName else { return "Select Model" }

        // Remove common prefixes
        let prefixes = ["Claude ", "GPT-", "Gemini ", "Grok ", "DeepSeek "]
        for prefix in prefixes where modelName.hasPrefix(prefix) {
            return String(modelName.dropFirst(prefix.count))
        }
        return modelName
    }
}

// MARK: - Previews

#Preview("Model Selector - Claude") {
    ZStack {
        Color.black.ignoresSafeArea()
        ModelSelectorButton(modelName: "Claude Sonnet 4.5") {}
    }
}

#Preview("Model Selector - GPT") {
    ZStack {
        Color.black.ignoresSafeArea()
        ModelSelectorButton(modelName: "GPT-5.2 Turbo") {}
    }
}

#Preview("Model Selector - Gemini") {
    ZStack {
        Color.black.ignoresSafeArea()
        ModelSelectorButton(modelName: "Gemini 2.5 Pro") {}
    }
}

#Preview("Model Selector - No Model") {
    ZStack {
        Color.black.ignoresSafeArea()
        ModelSelectorButton(modelName: nil) {}
    }
}
