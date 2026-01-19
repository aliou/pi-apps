//
//  ModelSelectorSheet.swift
//  pi-mobile
//
//  Sheet for selecting an AI model, grouped by provider with search
//

import SwiftUI
import PiCore
import PiUI

// MARK: - Helpers

private func formatContextWindow(_ tokens: Int) -> String {
    if tokens >= 1_000_000 {
        let millions = Double(tokens) / 1_000_000.0
        return String(format: "%.1fM", millions)
    }
    if tokens >= 1_000 {
        let thousands = Double(tokens) / 1_000.0
        return String(format: "%.0fK", thousands)
    }
    return "\(tokens)"
}

// MARK: - ModelSelectorSheet

struct ModelSelectorSheet: View {
    let client: RPCClient
    let currentModel: Model?
    let onSelect: (Model) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var models: [Model] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var searchText = ""

    // Filter models based on search
    private var filteredModels: [Model] {
        if searchText.isEmpty {
            return models
        }
        return models.filter { model in
            model.name.localizedCaseInsensitiveContains(searchText) ||
            model.provider.localizedCaseInsensitiveContains(searchText) ||
            model.id.localizedCaseInsensitiveContains(searchText)
        }
    }

    // Group filtered models by provider
    private var modelsByProvider: [String: [Model]] {
        Dictionary(grouping: filteredModels, by: \.provider)
    }

    // Sorted provider names for consistent ordering
    private var sortedProviders: [String] {
        modelsByProvider.keys.sorted()
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    loadingView
                } else if let errorMessage {
                    errorView(message: errorMessage)
                } else if models.isEmpty {
                    emptyView
                } else {
                    modelListView
                }
            }
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Theme.accent)
                }
            }
            .background(Theme.pageBg)
        }
        .task {
            await loadModels()
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .tint(Theme.accent)
            Text("Loading models...")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 40))
                .foregroundStyle(Theme.error)

            Text("Failed to Load Models")
                .font(.headline)
                .foregroundStyle(Theme.text)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                Task {
                    await loadModels()
                }
            } label: {
                Label("Retry", systemImage: "arrow.clockwise")
                    .font(.body.weight(.medium))
            }
            .buttonStyle(.bordered)
            .tint(Theme.accent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "cpu")
                .font(.system(size: 40))
                .foregroundStyle(Theme.muted)

            Text("No Models Available")
                .font(.headline)
                .foregroundStyle(Theme.text)

            Text("No AI models are currently available.")
                .font(.subheadline)
                .foregroundStyle(Theme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.pageBg)
    }

    private var modelListView: some View {
        List {
            if filteredModels.isEmpty {
                // No search results
                ContentUnavailableView.search(text: searchText)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(sortedProviders, id: \.self) { provider in
                    Section {
                        ForEach(modelsByProvider[provider] ?? [], id: \.id) { model in
                            modelRow(model)
                        }
                    } header: {
                        Text(provider.capitalized)
                            .foregroundStyle(Theme.textSecondary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.pageBg)
        .searchable(text: $searchText, prompt: "Search models")
    }

    private func modelRow(_ model: Model) -> some View {
        Button {
            onSelect(model)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.name)
                        .foregroundStyle(Theme.text)

                    Text("\(formatContextWindow(model.contextWindow)) context")
                        .font(.caption)
                        .foregroundStyle(Theme.textMuted)
                }

                Spacer()

                if isSelected(model) {
                    Image(systemName: "checkmark")
                        .foregroundStyle(Theme.accent)
                        .fontWeight(.semibold)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(
            isSelected(model) ? Theme.selectedBg : Theme.cardBg
        )
    }

    // MARK: - Helpers

    private func isSelected(_ model: Model) -> Bool {
        guard let currentModel else { return false }
        return model.id == currentModel.id && model.provider == currentModel.provider
    }

    // MARK: - Data Loading

    private func loadModels() async {
        isLoading = true
        errorMessage = nil

        do {
            let response = try await client.getAvailableModels()
            models = response.models
            isLoading = false
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }
}

// MARK: - Previews

// Static preview wrapper for design iteration
private struct ModelSelectorPreview: View {
    let models: [Model]
    let currentModel: Model?
    let isLoading: Bool
    let errorMessage: String?

    @State private var searchText = ""

    private var filteredModels: [Model] {
        if searchText.isEmpty {
            return models
        }
        return models.filter { model in
            model.name.localizedCaseInsensitiveContains(searchText) ||
            model.provider.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var modelsByProvider: [String: [Model]] {
        Dictionary(grouping: filteredModels, by: \.provider)
    }

    private var sortedProviders: [String] {
        modelsByProvider.keys.sorted()
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(Theme.accent)
                        Text("Loading models...")
                            .font(.subheadline)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 40))
                            .foregroundStyle(Theme.error)
                        Text(error)
                            .foregroundStyle(Theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        if filteredModels.isEmpty && !searchText.isEmpty {
                            ContentUnavailableView.search(text: searchText)
                                .listRowBackground(Color.clear)
                        } else {
                            ForEach(sortedProviders, id: \.self) { provider in
                                Section(provider.capitalized) {
                                    ForEach(modelsByProvider[provider] ?? [], id: \.id) { model in
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(model.name)
                                                    .foregroundStyle(Theme.text)
                                                Text("\(formatContextWindow(model.contextWindow)) context")
                                                    .font(.caption)
                                                    .foregroundStyle(Theme.textMuted)
                                            }
                                            Spacer()
                                            if model.id == currentModel?.id {
                                                Image(systemName: "checkmark")
                                                    .foregroundStyle(Theme.accent)
                                            }
                                        }
                                        .listRowBackground(
                                            model.id == currentModel?.id ? Theme.selectedBg : Theme.cardBg
                                        )
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                    .searchable(text: $searchText, prompt: "Search models")
                }
            }
            .background(Theme.pageBg)
            .navigationTitle("Select Model")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {}
                        .foregroundColor(Theme.accent)
                }
            }
        }
    }
}

#Preview("With Models") {
    ModelSelectorPreview(
        models: PreviewModels.all,
        currentModel: PreviewModels.claudeSonnet45,
        isLoading: false,
        errorMessage: nil
    )
}

#Preview("Loading") {
    ModelSelectorPreview(
        models: [],
        currentModel: nil,
        isLoading: true,
        errorMessage: nil
    )
}

#Preview("Error") {
    ModelSelectorPreview(
        models: [],
        currentModel: nil,
        isLoading: false,
        errorMessage: "Failed to connect to server"
    )
}

#Preview("Dark Mode") {
    ModelSelectorPreview(
        models: PreviewModels.all,
        currentModel: nil,
        isLoading: false,
        errorMessage: nil
    )
    .preferredColorScheme(.dark)
}

// MARK: - Preview Model Data

/// Realistic model data for previews - latest flagship models
private enum PreviewModels {
    // Anthropic - Claude 4.5 family
    static let claudeSonnet45 = Model(
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75),
        contextWindow: 200000,
        maxTokens: 64000
    )

    static let claudeOpus45 = Model(
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25),
        contextWindow: 200000,
        maxTokens: 64000
    )

    static let claudeHaiku45 = Model(
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        api: "anthropic-messages",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25),
        contextWindow: 200000,
        maxTokens: 64000
    )

    // Google - Gemini 3.0
    static let gemini3Pro = Model(
        id: "gemini-3.0-pro",
        name: "Gemini 3.0 Pro",
        api: "google-generative-ai",
        provider: "google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 1.25, output: 10, cacheRead: 0.3125, cacheWrite: 0),
        contextWindow: 2097152,
        maxTokens: 65536
    )

    static let gemini3Flash = Model(
        id: "gemini-3.0-flash",
        name: "Gemini 3.0 Flash",
        api: "google-generative-ai",
        provider: "google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0),
        contextWindow: 1048576,
        maxTokens: 32768
    )

    // OpenAI - GPT 5.2
    static let gpt52 = Model(
        id: "gpt-5.2",
        name: "GPT-5.2",
        api: "openai-responses",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0),
        contextWindow: 128000,
        maxTokens: 64000
    )

    static let gpt52Codex = Model(
        id: "gpt-5.2-codex",
        name: "GPT-5.2 Codex",
        api: "openai-responses",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        reasoning: true,
        input: ["text", "image"],
        cost: ModelCost(input: 2.5, output: 10, cacheRead: 0.5, cacheWrite: 0),
        contextWindow: 272000,
        maxTokens: 128000
    )

    // All models for previews
    static let all: [Model] = [
        claudeSonnet45,
        claudeOpus45,
        claudeHaiku45,
        gemini3Pro,
        gemini3Flash,
        gpt52,
        gpt52Codex
    ]
}
