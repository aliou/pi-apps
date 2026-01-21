//
//  ModelSelectorSheet.swift
//  Pi
//
//  Redesigned model selector with current default, recents, and provider grouping.
//  Shows model metadata: context window, vision support, reasoning support.
//

import SwiftUI
import PiCore

struct ModelSelectorSheet: View {
    let models: [Model]
    let currentModel: Model?
    let recentModelIds: [String]
    let onSelect: (Model) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            List {
                if let current = currentModel, searchText.isEmpty {
                    Section("Current") {
                        ModelRow(model: current, isSelected: true) {
                            dismiss()
                        }
                    }
                }

                if !recentModels.isEmpty && searchText.isEmpty {
                    Section("Recent") {
                        ForEach(recentModels) { model in
                            ModelRow(model: model, isSelected: model == currentModel) {
                                onSelect(model)
                                dismiss()
                            }
                        }
                    }
                }

                ForEach(groupedModels, id: \.0) { provider, providerModels in
                    Section(providerDisplayName(provider)) {
                        ForEach(providerModels) { model in
                            ModelRow(model: model, isSelected: model == currentModel) {
                                onSelect(model)
                                dismiss()
                            }
                        }
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Search models")
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .overlay {
                if filteredModels.isEmpty && !searchText.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
        }
    }

    private var recentModels: [Model] {
        recentModelIds.prefix(5).compactMap { id in
            models.first { $0.id == id && $0 != currentModel }
        }
    }

    private var filteredModels: [Model] {
        if searchText.isEmpty {
            return models
        }
        return models.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.provider.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var groupedModels: [(String, [Model])] {
        let grouped = Dictionary(grouping: filteredModels) { $0.provider }

        let providerOrder = ["anthropic", "openai", "google", "github-copilot", "xai", "deepseek"]
        let sortedProviders = grouped.keys.sorted { p1, p2 in
            let idx1 = providerOrder.firstIndex(of: p1) ?? Int.max
            let idx2 = providerOrder.firstIndex(of: p2) ?? Int.max
            if idx1 != idx2 {
                return idx1 < idx2
            }
            return p1 < p2
        }

        return sortedProviders.map { provider in
            (provider, grouped[provider] ?? [])
        }
    }

    private func providerDisplayName(_ provider: String) -> String {
        switch provider {
        case "anthropic": "Anthropic"
        case "openai": "OpenAI"
        case "google": "Google"
        case "github-copilot": "GitHub Copilot"
        case "xai": "xAI"
        case "deepseek": "DeepSeek"
        default: provider.capitalized
        }
    }
}

struct ModelRow: View {
    let model: Model
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.name)
                        .foregroundStyle(.primary)

                    HStack(spacing: 6) {
                        Text(formatContextWindow(model.contextWindow))
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        if model.input.contains("image") {
                            HStack(spacing: 2) {
                                Image(systemName: "eye")
                                Text("Vision")
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }

                        if model.reasoning {
                            HStack(spacing: 2) {
                                Image(systemName: "brain")
                                Text("Reasoning")
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.tint)
                        .fontWeight(.semibold)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func formatContextWindow(_ tokens: Int) -> String {
        if tokens >= 1_000_000 {
            return "\(tokens / 1_000_000)M tokens"
        }
        if tokens >= 1_000 {
            return "\(tokens / 1_000)K tokens"
        }
        return "\(tokens) tokens"
    }
}

// MARK: - Sample Data

extension Model {
    static let sampleModels: [Model] = [
        Model(
            id: "claude-sonnet-4-5",
            name: "Claude Sonnet 4.5",
            provider: "anthropic",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 200_000,
            maxTokens: 8192
        ),
        Model(
            id: "claude-opus-4-5",
            name: "Claude Opus 4.5",
            provider: "anthropic",
            reasoning: true,
            input: ["text", "image"],
            contextWindow: 200_000,
            maxTokens: 32_000
        ),
        Model(
            id: "claude-haiku-4",
            name: "Claude Haiku 4",
            provider: "anthropic",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 200_000,
            maxTokens: 8192
        ),
        Model(
            id: "gpt-5.2",
            name: "GPT-5.2",
            provider: "openai",
            reasoning: true,
            input: ["text", "image"],
            contextWindow: 128_000,
            maxTokens: 16_000
        ),
        Model(
            id: "gpt-4o",
            name: "GPT-4o",
            provider: "openai",
            reasoning: false,
            input: ["text", "image"],
            contextWindow: 128_000,
            maxTokens: 4096
        ),
        Model(
            id: "gemini-2.5-pro",
            name: "Gemini 2.5 Pro",
            provider: "google",
            reasoning: true,
            input: ["text", "image"],
            contextWindow: 1_000_000,
            maxTokens: 8192
        ),
        Model(
            id: "gemini-2.5-flash",
            name: "Gemini 2.5 Flash",
            provider: "google",
            reasoning: false,
            input: ["text"],
            contextWindow: 1_000_000,
            maxTokens: 8192
        ),
        Model(
            id: "grok-3",
            name: "Grok 3",
            provider: "xai",
            reasoning: false,
            input: ["text"],
            contextWindow: 128_000,
            maxTokens: 8192
        ),
        Model(
            id: "deepseek-r1",
            name: "DeepSeek R1",
            provider: "deepseek",
            reasoning: true,
            input: ["text"],
            contextWindow: 128_000,
            maxTokens: 8192
        )
    ]

    static let sampleCurrent = Model(
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
        reasoning: false,
        input: ["text", "image"],
        contextWindow: 200_000,
        maxTokens: 8192
    )

    static let sampleRecentIds = [
        "claude-opus-4-5",
        "gpt-5.2",
        "gemini-2.5-pro"
    ]
}

// MARK: - Previews

#Preview("Model Selector") {
    ModelSelectorSheet(
        models: Model.sampleModels,
        currentModel: Model.sampleCurrent,
        recentModelIds: Model.sampleRecentIds
    ) { model in
        print("Selected: \(model.name)")
    }
}

#Preview("Model Selector - No Current") {
    ModelSelectorSheet(
        models: Model.sampleModels,
        currentModel: nil,
        recentModelIds: Model.sampleRecentIds
    ) { model in
        print("Selected: \(model.name)")
    }
}

#Preview("Model Selector - No Recents") {
    ModelSelectorSheet(
        models: Model.sampleModels,
        currentModel: Model.sampleCurrent,
        recentModelIds: []
    ) { model in
        print("Selected: \(model.name)")
    }
}
