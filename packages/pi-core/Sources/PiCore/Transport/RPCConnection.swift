//
//  RPCConnection.swift
//  PiCore
//
//  Shared RPC connection logic for subprocess transport
//

import Foundation

/// Shared RPC connection logic for subprocess transport
public actor RPCConnection {

    // MARK: - Types

    public struct PendingRequest: Sendable {
        public let id: String
        public let method: String
        public let sessionId: String?
        public let continuation: CheckedContinuation<Data, Error>
        public let timestamp: Date

        public init(
            id: String,
            method: String,
            sessionId: String?,
            continuation: CheckedContinuation<Data, Error>,
            timestamp: Date = Date()
        ) {
            self.id = id
            self.method = method
            self.sessionId = sessionId
            self.continuation = continuation
            self.timestamp = timestamp
        }
    }

    // MARK: - State

    private var pendingRequests: [String: PendingRequest] = [:]
    private var eventsContinuation: AsyncStream<TransportEvent>.Continuation?
    private var _events: AsyncStream<TransportEvent>?

    // MARK: - Initialization

    public init() {}

    // MARK: - Public Interface

    /// Stream of events
    public var events: AsyncStream<TransportEvent> {
        if let existing = _events {
            return existing
        }
        let (stream, continuation) = AsyncStream<TransportEvent>.makeStream(
            bufferingPolicy: .bufferingNewest(100)
        )
        self.eventsContinuation = continuation
        self._events = stream
        return stream
    }

    /// Register a pending request
    public func registerRequest(
        id: String,
        method: String,
        sessionId: String?,
        continuation: CheckedContinuation<Data, Error>
    ) {
        pendingRequests[id] = PendingRequest(
            id: id,
            method: method,
            sessionId: sessionId,
            continuation: continuation
        )
    }

    /// Remove and fail a pending request
    public func failRequest(id: String, error: Error) {
        if let pending = pendingRequests.removeValue(forKey: id) {
            pending.continuation.resume(throwing: error)
        }
    }

    /// Retry matching a response to a pending request (handles race condition)
    private func retryResponseMatching(command: String, data: Data, attempts: Int) async {
        // Give registration a chance to complete
        try? await Task.sleep(nanoseconds: 10_000_000) // 10ms

        if let pending = pendingRequests.removeValue(forKey: command) {
            pending.continuation.resume(returning: data)
            return
        }

        // Retry a few times
        if attempts < 5 {
            await retryResponseMatching(command: command, data: data, attempts: attempts + 1)
        } else {
            print("[RPCConnection] Warning: No pending request found for response command: \(command)")
        }
    }

    /// Process incoming raw JSON data (legacy JSONL format from subprocess)
    public func processIncoming(_ data: Data) {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        guard let rawMessage = try? decoder.decode(RawRPCMessage.self, from: data) else {
            return
        }

        if rawMessage.type == "response" {
            // Response handling - use command as ID
            if let command = rawMessage.command {
                if let pending = pendingRequests.removeValue(forKey: command) {
                    pending.continuation.resume(returning: data)
                } else {
                    // Race condition: response arrived before request was registered
                    // Queue for retry
                    Task {
                        await self.retryResponseMatching(command: command, data: data, attempts: 0)
                    }
                }
            }
        } else {
            // Event handling - convert to TransportEvent
            let event = parseRPCEvent(from: rawMessage, rawData: data)
            eventsContinuation?.yield(TransportEvent(
                sessionId: "default", // Subprocess format doesn't have sessionId
                event: event,
                seq: nil
            ))
        }
    }

    /// Parse AssistantMessageEvent from a dictionary using Codable
    private func parseAssistantMessageEvent(from dict: [String: Any]) -> AssistantMessageEvent {
        // Server sends "assistantMessageEvent", legacy sends "event"
        let eventDict = dict["assistantMessageEvent"] as? [String: Any]
            ?? dict["event"] as? [String: Any]
            ?? dict

        // Convert to JSON data and decode using Codable
        do {
            let data = try JSONSerialization.data(withJSONObject: eventDict)
            return try JSONDecoder().decode(AssistantMessageEvent.self, from: data)
        } catch {
            let eventType = eventDict["type"] as? String ?? "unknown"
            return .unknown(type: eventType)
        }
    }

    /// Parse RawRPCMessage into RPCEvent
    private func parseRPCEvent(from message: RawRPCMessage, rawData: Data) -> RPCEvent {
        switch message.type {
        case "agent_start":
            return .agentStart

        case "agent_end":
            let success = message.success ?? true
            return .agentEnd(success: success, error: message.error)

        case "turn_start":
            return .turnStart

        case "turn_end":
            return .turnEnd

        case "message_start":
            return .messageStart(messageId: message.messageId)

        case "message_end":
            return .messageEnd(stopReason: message.stopReason)

        case "message_update":
            let event = message.assistantMessageEvent ?? .unknown(type: "unknown")
            return .messageUpdate(message: message.message, event: event)

        case "tool_execution_start":
            let toolCallId = message.toolCallId ?? ""
            let toolName = message.toolName ?? ""
            return .toolExecutionStart(
                toolCallId: toolCallId,
                toolName: toolName,
                args: message.args
            )

        case "tool_execution_update":
            let toolCallId = message.toolCallId ?? ""
            var output = ""
            if let partialResult = message.partialResult,
               let content = partialResult.content {
                output = content.compactMap { $0.text }.joined()
            }
            return .toolExecutionUpdate(toolCallId: toolCallId, output: output)

        case "tool_execution_end":
            let toolCallId = message.toolCallId ?? ""
            var output: String?
            if let result = message.result, let content = result.content {
                output = content.compactMap { $0.text }.joined()
            }
            let status: ToolStatus = message.isError == true ? .error : .success
            return .toolExecutionEnd(toolCallId: toolCallId, output: output, status: status)

        case "auto_compaction_start":
            return .autoCompactionStart

        case "auto_compaction_end":
            return .autoCompactionEnd

        case "auto_retry_start":
            return .autoRetryStart(
                attempt: message.attempt ?? 0,
                maxAttempts: message.maxAttempts ?? 0,
                delayMs: message.delayMs ?? 0,
                errorMessage: message.errorMessage ?? ""
            )

        case "auto_retry_end":
            return .autoRetryEnd(
                success: message.success ?? true,
                attempt: message.attempt ?? 0,
                finalError: message.finalError
            )

        case "hook_error":
            return .hookError(
                extensionPath: message.extensionPath,
                event: message.event,
                error: message.errorMessage
            )

        case "extension_error":
            return .extensionError(
                extensionPath: message.extensionPath ?? "",
                event: message.event ?? "",
                error: message.errorMessage ?? ""
            )

        case "extension_ui_request":
            // Decode the full request using the raw data
            if let request = try? JSONDecoder().decode(ExtensionUIRequest.self, from: rawData) {
                return .extensionUIRequest(request)
            }
            return .unknown(type: message.type, raw: rawData)

        case "state_update":
            return .stateUpdate(context: message.context ?? StateContext(
                workingDirectory: nil,
                model: nil,
                conversationId: nil,
                messageCount: nil,
                isProcessing: nil
            ))

        case "model_changed":
            // Parse model from the raw message data
            if let dataDict = message.data?.value as? [String: Any],
               let modelDict = dataDict["model"] as? [String: Any],
               let modelData = try? JSONSerialization.data(withJSONObject: modelDict),
               let model = try? JSONDecoder().decode(ModelInfo.self, from: modelData) {
                return .modelChanged(model: model)
            }
            return .unknown(type: message.type, raw: rawData)

        default:
            return .unknown(type: message.type, raw: rawData)
        }
    }

    /// Reset connection state
    public func reset() {
        // Fail all pending requests
        for (_, request) in pendingRequests {
            request.continuation.resume(throwing: RPCTransportError.connectionLost("Reset"))
        }
        pendingRequests.removeAll()
    }

    /// Finish event stream
    public func finishEvents() {
        eventsContinuation?.finish()
        _events = nil
        eventsContinuation = nil
    }
}
