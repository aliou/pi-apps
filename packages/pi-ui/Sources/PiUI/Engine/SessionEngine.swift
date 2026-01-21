//
//  SessionEngine.swift
//  PiUI
//
//  Observable state manager for a single conversation session.
//  Handles message streaming, tool calls, and events.
//

import Foundation
import SwiftUI

public enum StreamingBehavior: String, Sendable {
    case steer
    case followUp
}

/// Callbacks for platform-specific RPC operations
public struct SessionEngineCallbacks: Sendable {
    public let sendPrompt: @Sendable (String, StreamingBehavior?) async throws -> Void
    public let abort: @Sendable () async throws -> Void

    public init(
        sendPrompt: @escaping @Sendable (String, StreamingBehavior?) async throws -> Void,
        abort: @escaping @Sendable () async throws -> Void
    ) {
        self.sendPrompt = sendPrompt
        self.abort = abort
    }
}

/// Observable session state manager
@MainActor
@Observable
public final class SessionEngine {
    // MARK: - Published State

    public private(set) var messages: [ConversationItem] = []
    public private(set) var isProcessing = false
    public private(set) var streamingText = ""
    public private(set) var streamingId: String?
    public private(set) var error: String?

    // MARK: - Private State

    private var callbacks: SessionEngineCallbacks?
    private var lastGeneratedToolCallId: String?

    // MARK: - Initialization

    public init() {}

    /// Configure the engine with platform-specific callbacks
    public func configure(callbacks: SessionEngineCallbacks) {
        self.callbacks = callbacks
    }

    /// Set initial messages (e.g., from history)
    public func setMessages(_ items: [ConversationItem]) {
        messages = items
    }

    /// Append a single message (e.g., system events)
    public func appendMessage(_ item: ConversationItem) {
        messages.append(item)
    }

    /// Clear all messages
    public func clearMessages() {
        messages = []
        streamingText = ""
        streamingId = nil
        error = nil
    }

    // MARK: - User Actions

    /// Send a user message
    public func send(_ text: String, defaultStreamingBehavior: StreamingBehavior = .steer) async {
        guard let callbacks else {
            error = "Engine not configured"
            return
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let wasProcessing = isProcessing
        let streamingBehavior: StreamingBehavior? = wasProcessing ? defaultStreamingBehavior : nil

        // Add user message immediately
        let userMessageId = UUID().uuidString
        messages.append(.userMessage(id: userMessageId, text: trimmed, queuedBehavior: streamingBehavior))
        isProcessing = true
        error = nil

        do {
            try await callbacks.sendPrompt(trimmed, streamingBehavior)
        } catch {
            self.error = error.localizedDescription
            isProcessing = false
        }
    }

    /// Abort the current operation
    public func abort() async {
        guard let callbacks else { return }

        do {
            try await callbacks.abort()
        } catch {
            self.error = error.localizedDescription
        }
        isProcessing = false
    }

    // MARK: - Event Handling

    /// Handle an RPC event
    public func handleAgentStart() {
        isProcessing = true
        streamingText = ""
        streamingId = UUID().uuidString
    }

    public func handleTurnStart() {
        clearNextQueuedBehavior()
    }

    public func handleAgentEnd(success: Bool, errorMessage: String?) {
        isProcessing = false
        flushStreamingText()

        if !success, let errorMessage {
            error = errorMessage
        }
    }

    public func handleMessageEnd() {
        flushStreamingText()
    }

    public func handleTextDelta(_ delta: String) {
        if streamingId == nil {
            streamingId = UUID().uuidString
        }

        streamingText += delta
        updateStreamingMessage(id: streamingId, text: streamingText)
    }

    public func handleToolUseStart(toolCallId: String, toolName: String) {
        flushStreamingText()

        let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
        if toolCallId.isEmpty {
            lastGeneratedToolCallId = resolvedId
        }

        messages.append(.toolCall(
            id: resolvedId,
            name: toolName,
            args: nil,
            output: nil,
            status: .running
        ))
    }

    public func handleToolUseInputDelta(toolCallId: String, delta: String) {
        let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId

        guard let index = messages.firstIndex(where: { $0.id == resolvedId }) else { return }

        if case .toolCall(let id, let name, let existingArgs, let output, let status) = messages[index] {
            let newArgs = (existingArgs ?? "") + delta
            messages[index] = .toolCall(id: id, name: name, args: newArgs, output: output, status: status)
        }
    }

    public func handleToolExecutionStart(toolCallId: String, toolName: String, argsString: String?) {
        flushStreamingText()

        let resolvedId = toolCallId.isEmpty ? UUID().uuidString : toolCallId
        if toolCallId.isEmpty {
            lastGeneratedToolCallId = resolvedId
        }

        // Check if entry already exists (from toolUseStart) - update args if so
        if let existingIndex = messages.firstIndex(where: { $0.id == resolvedId }) {
            if case .toolCall(let id, let name, _, let output, let status) = messages[existingIndex] {
                messages[existingIndex] = .toolCall(
                    id: id,
                    name: name,
                    args: argsString,
                    output: output,
                    status: status
                )
            }
        } else {
            messages.append(.toolCall(
                id: resolvedId,
                name: toolName,
                args: argsString,
                output: nil,
                status: .running
            ))
        }
    }

    public func handleToolExecutionUpdate(toolCallId: String, output: String) {
        let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
        updateToolCall(id: resolvedId, output: output, status: .running)
    }

    public func handleToolExecutionEnd(toolCallId: String, output: String?, success: Bool) {
        let resolvedId = toolCallId.isEmpty ? (lastGeneratedToolCallId ?? toolCallId) : toolCallId
        let status: ToolCallStatus = success ? .success : .error
        updateToolCall(id: resolvedId, output: output, status: status)
    }

    // MARK: - Private Helpers

    private func flushStreamingText() {
        guard !streamingText.isEmpty else {
            streamingId = nil
            return
        }

        let id = streamingId ?? UUID().uuidString
        updateStreamingMessage(id: id, text: streamingText)
        streamingText = ""
        streamingId = nil
    }

    private func updateStreamingMessage(id: String?, text: String) {
        guard let id else { return }

        if let index = messages.firstIndex(where: { $0.id == id }) {
            if case .assistantText = messages[index] {
                messages[index] = .assistantText(id: id, text: text)
            }
            return
        }

        messages.append(.assistantText(id: id, text: text))
    }

    private func updateToolCall(id: String, output: String?, status: ToolCallStatus) {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }

        if case .toolCall(let existingId, let name, let args, let existingOutput, _) = messages[index] {
            let newOutput = output ?? existingOutput
            messages[index] = .toolCall(
                id: existingId,
                name: name,
                args: args,
                output: newOutput,
                status: status
            )
        }
    }

    private func clearNextQueuedBehavior() {
        guard let index = messages.firstIndex(where: { item in
            if case .userMessage(_, _, let queuedBehavior) = item {
                return queuedBehavior != nil
            }
            return false
        }) else { return }

        if case .userMessage(let id, let text, _) = messages[index] {
            messages[index] = .userMessage(id: id, text: text, queuedBehavior: nil)
        }
    }
}
