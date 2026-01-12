//
//  RPCConnection.swift
//  PiCore
//
//  Shared RPC connection logic used by both transports
//

import Foundation

/// Shared RPC connection logic used by both transports
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

    /// Last sequence number received per session (for resume)
    public private(set) var lastSeqBySession: [String: UInt64] = [:]

    /// Current connection ID
    public private(set) var connectionId: String?

    /// Server capabilities from hello
    public private(set) var capabilities: ServerCapabilities?

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

    /// Process incoming raw JSON data
    public func processIncoming(_ data: Data) {
        let decoder = JSONDecoder()

        // First try the new envelope format
        if let message = try? decoder.decode(WSIncomingMessage.self, from: data) {
            switch message.kind {
            case .response:
                handleResponse(message, rawData: data)
            case .event:
                handleEvent(message)
            case .request:
                // Servers don't send requests to clients
                break
            }
            return
        }

        // Fall back to legacy format for subprocess compatibility
        processLegacyMessage(data)
    }

    /// Process legacy JSONL format (for subprocess compatibility)
    private func processLegacyMessage(_ data: Data) {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        guard let rawMessage = try? decoder.decode(RawRPCMessage.self, from: data) else {
            return
        }

        if rawMessage.type == "response" {
            // Legacy response handling - use command as ID
            if let command = rawMessage.command,
               let pending = pendingRequests.removeValue(forKey: command) {
                pending.continuation.resume(returning: data)
            }
        } else {
            // Legacy event handling - convert to TransportEvent
            let event = parseRPCEvent(from: rawMessage, rawData: data)
            eventsContinuation?.yield(TransportEvent(
                sessionId: "default", // Legacy format doesn't have sessionId
                event: event,
                seq: nil
            ))
        }
    }

    /// Handle response message (new envelope format)
    private func handleResponse(_ message: WSIncomingMessage, rawData: Data) {
        guard let id = message.id,
              let pending = pendingRequests.removeValue(forKey: id) else {
            return
        }

        if message.ok == true {
            pending.continuation.resume(returning: rawData)
        } else if let error = message.error {
            pending.continuation.resume(throwing: RPCTransportError.serverError(error))
        } else {
            pending.continuation.resume(
                throwing: RPCTransportError.invalidResponse("No data in response")
            )
        }
    }

    /// Handle event message (new envelope format)
    private func handleEvent(_ message: WSIncomingMessage) {
        guard let sessionId = message.sessionId,
              let seq = message.seq,
              let type = message.type else {
            return
        }

        // Update last seq for session
        lastSeqBySession[sessionId] = seq

        // Parse event payload
        let event = parseEventPayload(type: type, payload: message.payload)

        eventsContinuation?.yield(TransportEvent(
            sessionId: sessionId,
            event: event,
            seq: seq
        ))
    }

    /// Parse event payload into RPCEvent (new envelope format)
    private func parseEventPayload(type: String, payload: AnyCodable?) -> RPCEvent {
        let dict = payload?.value as? [String: Any] ?? [:]

        switch type {
        case "agent_start":
            return .agentStart

        case "agent_end":
            let success = dict["success"] as? Bool ?? true
            var rpcError: RPCError?
            if let errorDict = dict["error"] as? [String: Any] {
                rpcError = RPCError(
                    code: errorDict["code"] as? String,
                    message: errorDict["message"] as? String ?? "Unknown error",
                    details: errorDict["details"] as? String
                )
            }
            return .agentEnd(success: success, error: rpcError)

        case "turn_start":
            return .turnStart

        case "turn_end":
            return .turnEnd

        case "message_start":
            let messageId = dict["messageId"] as? String
            return .messageStart(messageId: messageId)

        case "message_end":
            let stopReason = dict["stopReason"] as? String
            return .messageEnd(stopReason: stopReason)

        case "message_update":
            let event = parseAssistantMessageEvent(from: dict)
            return .messageUpdate(message: nil, event: event)

        case "tool_execution_start":
            let toolCallId = dict["toolCallId"] as? String ?? ""
            let toolName = dict["toolName"] as? String ?? ""
            let args = dict["args"].map { AnyCodable($0) }
            return .toolExecutionStart(toolCallId: toolCallId, toolName: toolName, args: args)

        case "tool_execution_update":
            let toolCallId = dict["toolCallId"] as? String ?? ""
            let output = dict["output"] as? String ?? ""
            return .toolExecutionUpdate(toolCallId: toolCallId, output: output)

        case "tool_execution_end":
            let toolCallId = dict["toolCallId"] as? String ?? ""
            let output = dict["output"] as? String
            let statusStr = dict["status"] as? String ?? "success"
            let status = ToolStatus(rawValue: statusStr) ?? .success
            return .toolExecutionEnd(toolCallId: toolCallId, output: output, status: status)

        case "auto_compaction_start":
            return .autoCompactionStart

        case "auto_compaction_end":
            return .autoCompactionEnd

        case "auto_retry_start":
            let attempt = dict["attempt"] as? Int ?? 0
            let maxAttempts = dict["maxAttempts"] as? Int ?? 0
            let delayMs = dict["delayMs"] as? Int ?? 0
            let errorMessage = dict["errorMessage"] as? String ?? ""
            return .autoRetryStart(
                attempt: attempt,
                maxAttempts: maxAttempts,
                delayMs: delayMs,
                errorMessage: errorMessage
            )

        case "auto_retry_end":
            let success = dict["success"] as? Bool ?? true
            let attempt = dict["attempt"] as? Int ?? 0
            let finalError = dict["finalError"] as? String
            return .autoRetryEnd(success: success, attempt: attempt, finalError: finalError)

        case "hook_error":
            let extensionPath = dict["extensionPath"] as? String
            let eventName = dict["event"] as? String
            let errorMsg = dict["error"] as? String
            return .hookError(extensionPath: extensionPath, event: eventName, error: errorMsg)

        case "state_update":
            // Try to decode StateContext from payload
            if let contextDict = dict["context"] as? [String: Any],
               let contextData = try? JSONSerialization.data(withJSONObject: contextDict),
               let context = try? JSONDecoder().decode(StateContext.self, from: contextData) {
                return .stateUpdate(context: context)
            }
            return .stateUpdate(context: StateContext(
                workingDirectory: nil,
                model: nil,
                conversationId: nil,
                messageCount: nil,
                isProcessing: nil
            ))

        default:
            return .unknown(type: type, raw: Data())
        }
    }

    /// Parse AssistantMessageEvent from a dictionary
    private func parseAssistantMessageEvent(from dict: [String: Any]) -> AssistantMessageEvent {
        let eventDict = dict["event"] as? [String: Any] ?? dict
        let eventType = eventDict["type"] as? String ?? ""

        switch eventType {
        case "text_delta":
            let delta = eventDict["delta"] as? String ?? ""
            return .textDelta(delta: delta)

        case "thinking_delta":
            let delta = eventDict["delta"] as? String ?? ""
            return .thinkingDelta(delta: delta)

        case "tool_use_start", "toolcall_start":
            let toolCallId = eventDict["toolCallId"] as? String ?? ""
            let toolName = eventDict["toolName"] as? String ?? ""
            return .toolUseStart(toolCallId: toolCallId, toolName: toolName)

        case "tool_use_input_delta", "toolcall_delta":
            let toolCallId = eventDict["toolCallId"] as? String ?? ""
            let delta = eventDict["delta"] as? String ?? ""
            return .toolUseInputDelta(toolCallId: toolCallId, delta: delta)

        case "tool_use_end", "toolcall_end":
            let toolCallId = eventDict["toolCallId"] as? String ?? ""
            return .toolUseEnd(toolCallId: toolCallId)

        case "message_start", "start":
            let messageId = eventDict["messageId"] as? String ?? ""
            return .messageStart(messageId: messageId)

        case "message_end", "done":
            let stopReason = eventDict["stopReason"] as? String
            return .messageEnd(stopReason: stopReason)

        default:
            return .unknown(type: eventType)
        }
    }

    /// Parse legacy RawRPCMessage into RPCEvent
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

        case "state_update":
            return .stateUpdate(context: message.context ?? StateContext(
                workingDirectory: nil,
                model: nil,
                conversationId: nil,
                messageCount: nil,
                isProcessing: nil
            ))

        default:
            return .unknown(type: message.type, raw: rawData)
        }
    }

    /// Set connection info from hello response
    public func setConnectionInfo(connectionId: String, capabilities: ServerCapabilities) {
        self.connectionId = connectionId
        self.capabilities = capabilities
    }

    /// Get resume info for reconnection
    public func getResumeInfo() -> ResumeInfo? {
        guard let connectionId else { return nil }
        return ResumeInfo(
            connectionId: connectionId,
            lastSeqBySession: lastSeqBySession
        )
    }

    /// Reset connection state
    public func reset() {
        // Fail all pending requests
        for (_, request) in pendingRequests {
            request.continuation.resume(throwing: RPCTransportError.connectionLost("Reset"))
        }
        pendingRequests.removeAll()
        connectionId = nil
        capabilities = nil
    }

    /// Reset sequence tracking (after failed resume)
    public func resetSeqTracking() {
        lastSeqBySession.removeAll()
    }

    /// Finish event stream
    public func finishEvents() {
        eventsContinuation?.finish()
        _events = nil
        eventsContinuation = nil
    }
}
