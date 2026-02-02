//
//  RelaySessionTransport.swift
//  PiCore
//
//  WebSocket transport for per-session relay connection
//

import Foundation

/// WebSocket transport for a relay session
public actor RelaySessionTransport {
    public let baseURL: URL
    public let sessionId: String

    private var webSocketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var eventsContinuation: AsyncStream<RelayEvent>.Continuation?

    // Request/response handling
    private var pendingRequests: [String: CheckedContinuation<Data, Error>] = [:]

    private var _isConnected = false
    public var isConnected: Bool { _isConnected }

    public init(baseURL: URL, sessionId: String) {
        self.baseURL = baseURL
        self.sessionId = sessionId
    }

    // MARK: - Connection

    public func connect(lastSeq: Int? = nil) async throws {
        // Build WebSocket URL: ws://host/ws/sessions/{sessionId}?lastSeq=N
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components.path = "/ws/sessions/\(sessionId)"
        if let lastSeq {
            components.queryItems = [URLQueryItem(name: "lastSeq", value: String(lastSeq))]
        }

        guard let wsURL = components.url else {
            throw AgentConnectionError.connectionFailed("Invalid WebSocket URL")
        }

        let task = URLSession.shared.webSocketTask(with: wsURL)
        self.webSocketTask = task
        task.resume()

        _isConnected = true
        startReceiving()
    }

    public func disconnect() async {
        _isConnected = false
        receiveTask?.cancel()
        receiveTask = nil
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        eventsContinuation?.finish()
        eventsContinuation = nil

        // Fail all pending requests
        for (_, continuation) in pendingRequests {
            continuation.resume(throwing: AgentConnectionError.connectionLost("Disconnected"))
        }
        pendingRequests.removeAll()
    }

    // MARK: - Events

    public var events: AsyncStream<RelayEvent> {
        AsyncStream { continuation in
            self.eventsContinuation = continuation
            continuation.onTermination = { @Sendable _ in
                Task { await self.handleStreamTermination() }
            }
        }
    }

    // MARK: - Commands (fire-and-forget)

    /// Send a command to the session (raw JSON, no response expected)
    public func send(_ command: [String: Any]) async throws {
        guard _isConnected, let task = webSocketTask else {
            throw AgentConnectionError.notConnected
        }

        let data = try JSONSerialization.data(withJSONObject: command)
        guard let string = String(data: data, encoding: .utf8) else {
            throw AgentConnectionError.commandFailed("Failed to encode command")
        }

        try await task.send(.string(string))
    }

    // MARK: - Commands (request/response)

    /// Send a command and wait for response
    public func sendAndWaitForResponse<T: Decodable>(_ command: [String: Any], responseType: T.Type) async throws -> T {
        guard _isConnected, let task = webSocketTask else {
            throw AgentConnectionError.notConnected
        }

        guard let commandType = command["type"] as? String else {
            throw AgentConnectionError.commandFailed("Command missing type")
        }

        let data = try JSONSerialization.data(withJSONObject: command)
        guard let string = String(data: data, encoding: .utf8) else {
            throw AgentConnectionError.commandFailed("Failed to encode command")
        }

        let responseData: Data = try await withCheckedThrowingContinuation { continuation in
            self.pendingRequests[commandType] = continuation

            Task {
                do {
                    try await task.send(.string(string))
                } catch {
                    if let cont = self.pendingRequests.removeValue(forKey: commandType) {
                        cont.resume(throwing: AgentConnectionError.commandFailed(error.localizedDescription))
                    }
                }
            }
        }

        // Decode response
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: responseData)
    }

    // Convenience methods for common commands

    public func prompt(
        message: String,
        id: String? = nil,
        images: [[String: Any]]? = nil,
        streamingBehavior: String? = nil
    ) async throws {
        var command: [String: Any] = ["type": "prompt", "message": message]
        if let id { command["id"] = id }
        if let images { command["images"] = images }
        if let streamingBehavior { command["streamingBehavior"] = streamingBehavior }
        try await send(command)
    }

    public func abort(id: String? = nil) async throws {
        var command: [String: Any] = ["type": "abort"]
        if let id { command["id"] = id }
        try await send(command)
    }

    public func getState() async throws -> GetStateResponse {
        let command: [String: Any] = ["type": "get_state"]
        // handleResponse already extracts the data portion, so decode directly
        return try await sendAndWaitForResponse(command, responseType: GetStateResponse.self)
    }

    public func setModel(provider: String, modelId: String) async throws {
        let command: [String: Any] = ["type": "set_model", "provider": provider, "modelId": modelId]
        try await send(command)
    }

    public func getAvailableModels() async throws -> GetAvailableModelsResponse {
        let command: [String: Any] = ["type": "get_available_models"]
        // handleResponse already extracts the data portion, so decode directly
        return try await sendAndWaitForResponse(command, responseType: GetAvailableModelsResponse.self)
    }

    public func getMessages() async throws -> GetMessagesResponse {
        let command: [String: Any] = ["type": "get_messages"]
        // handleResponse already extracts the data portion, so decode directly
        return try await sendAndWaitForResponse(command, responseType: GetMessagesResponse.self)
    }

    public func nativeToolResponse(
        toolCallId: String,
        result: Any?,
        isError: Bool,
        id: String? = nil
    ) async throws {
        var command: [String: Any] = [
            "type": "native_tool_response",
            "toolCallId": toolCallId,
            "isError": isError
        ]
        if let result { command["result"] = result }
        if let id { command["id"] = id }
        try await send(command)
    }

    public func extensionUIResponse(
        requestId: String,
        value: String? = nil,
        confirmed: Bool? = nil,
        cancelled: Bool? = nil
    ) async throws {
        var command: [String: Any] = [
            "type": "extension_ui_response",
            "id": requestId
        ]
        if let value { command["value"] = value }
        if let confirmed { command["confirmed"] = confirmed }
        if let cancelled { command["cancelled"] = cancelled }
        try await send(command)
    }

    // MARK: - Private

    private func startReceiving() {
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, let task = await self.webSocketTask else { break }

                do {
                    let message = try await task.receive()
                    await self.handleMessage(message)
                } catch {
                    if !Task.isCancelled {
                        await self.handleConnectionError(error)
                    }
                    break
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        guard let data = message.data else {
            return
        }

        // Parse the message type first
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        // Handle response messages (from Pi commands)
        if type == "response" {
            handleResponse(json: json, data: data)
            return
        }

        let event = parseEvent(type: type, json: json, data: data)
        eventsContinuation?.yield(event)
    }

    private func handleResponse(json: [String: Any], data: Data) {
        guard let command = json["command"] as? String else {
            return
        }

        guard let continuation = pendingRequests.removeValue(forKey: command) else {
            return
        }

        if let success = json["success"] as? Bool, success,
           let responseData = json["data"] {
            do {
                let dataJson = try JSONSerialization.data(withJSONObject: responseData)
                continuation.resume(returning: dataJson)
            } catch {
                continuation.resume(throwing: AgentConnectionError.invalidResponse("Failed to serialize response data"))
            }
        } else if let error = json["error"] as? [String: Any] {
            let message = error["message"] as? String ?? "Unknown error"
            continuation.resume(throwing: AgentConnectionError.commandFailed(message))
        } else {
            continuation.resume(throwing: AgentConnectionError.invalidResponse("Invalid response format"))
        }
    }

    private func parseEvent(type: String, json: [String: Any], data: Data) -> RelayEvent {
        // Relay-specific events
        switch type {
        case "connected":
            let sessionId = json["sessionId"] as? String ?? ""
            let lastSeq = json["lastSeq"] as? Int ?? 0
            return .relay(.connected(sessionId: sessionId, lastSeq: lastSeq))

        case "replay_start":
            let fromSeq = json["fromSeq"] as? Int ?? 0
            let toSeq = json["toSeq"] as? Int ?? 0
            return .relay(.replayStart(fromSeq: fromSeq, toSeq: toSeq))

        case "replay_end":
            return .relay(.replayEnd)

        case "sandbox_status":
            let statusStr = json["status"] as? String ?? "error"
            let status = SandboxStatus(rawValue: statusStr) ?? .error
            let message = json["message"] as? String
            return .relay(.sandboxStatus(status: status, message: message))

        case "error":
            let code = json["code"] as? String ?? "unknown"
            let message = json["message"] as? String ?? "Unknown error"
            return .relay(.error(code: code, message: message))

        default:
            // Pi event - parse using RPCEvent parsing logic
            let piEvent = parsePiEvent(type: type, json: json, data: data)
            return .pi(piEvent)
        }
    }

    private func parsePiEvent(type: String, json: [String: Any], data: Data) -> RPCEvent {
        // Decode using JSONDecoder for type safety
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        switch type {
        case "agent_start":
            return .agentStart

        case "agent_end":
            let success = json["success"] as? Bool ?? true
            var rpcError: RPCError?
            if let errorDict = json["error"] as? [String: Any] {
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
            let messageId = json["messageId"] as? String
            return .messageStart(messageId: messageId)

        case "message_end":
            let stopReason = json["stopReason"] as? String
            return .messageEnd(stopReason: stopReason)

        case "message_update":
            let event = parseAssistantMessageEvent(from: json)
            return .messageUpdate(message: nil, event: event)

        case "tool_execution_start":
            let toolCallId = json["toolCallId"] as? String ?? ""
            let toolName = json["toolName"] as? String ?? ""
            let args = json["args"].map { AnyCodable($0) }
            return .toolExecutionStart(toolCallId: toolCallId, toolName: toolName, args: args)

        case "tool_execution_update":
            let toolCallId = json["toolCallId"] as? String ?? ""
            var output = ""
            if let partialResult = json["partialResult"] as? [String: Any],
               let content = partialResult["content"] as? [[String: Any]] {
                output = content.compactMap { $0["text"] as? String }.joined()
            }
            return .toolExecutionUpdate(toolCallId: toolCallId, output: output)

        case "tool_execution_end":
            let toolCallId = json["toolCallId"] as? String ?? ""
            var output: String?
            if let result = json["result"] as? [String: Any],
               let content = result["content"] as? [[String: Any]] {
                output = content.compactMap { $0["text"] as? String }.joined()
            }
            let isError = json["isError"] as? Bool ?? false
            let status: ToolStatus = isError ? .error : .success
            return .toolExecutionEnd(toolCallId: toolCallId, output: output, status: status)

        case "auto_compaction_start":
            return .autoCompactionStart

        case "auto_compaction_end":
            return .autoCompactionEnd

        case "auto_retry_start":
            return .autoRetryStart(
                attempt: json["attempt"] as? Int ?? 0,
                maxAttempts: json["maxAttempts"] as? Int ?? 0,
                delayMs: json["delayMs"] as? Int ?? 0,
                errorMessage: json["errorMessage"] as? String ?? ""
            )

        case "auto_retry_end":
            return .autoRetryEnd(
                success: json["success"] as? Bool ?? true,
                attempt: json["attempt"] as? Int ?? 0,
                finalError: json["finalError"] as? String
            )

        case "hook_error":
            return .hookError(
                extensionPath: json["extensionPath"] as? String,
                event: json["event"] as? String,
                error: json["error"] as? String
            )

        case "extension_error":
            return .extensionError(
                extensionPath: json["extensionPath"] as? String ?? "",
                event: json["event"] as? String ?? "",
                error: json["error"] as? String ?? ""
            )

        case "extension_ui_request":
            // Decode the full request using the raw data
            if let request = try? decoder.decode(ExtensionUIRequest.self, from: data) {
                return .extensionUIRequest(request)
            }
            return .unknown(type: type, raw: data)

        case "state_update":
            if let contextDict = json["context"] as? [String: Any],
               let contextData = try? JSONSerialization.data(withJSONObject: contextDict),
               let context = try? decoder.decode(StateContext.self, from: contextData) {
                return .stateUpdate(context: context)
            }
            return .stateUpdate(context: StateContext(
                workingDirectory: nil,
                model: nil,
                conversationId: nil,
                messageCount: nil,
                isProcessing: nil
            ))

        case "model_changed":
            if let modelDict = json["model"] as? [String: Any],
               let modelData = try? JSONSerialization.data(withJSONObject: modelDict),
               let model = try? decoder.decode(ModelInfo.self, from: modelData) {
                return .modelChanged(model: model)
            }
            return .unknown(type: type, raw: data)

        case "native_tool_request":
            let callId = json["callId"] as? String ?? ""
            let toolName = json["toolName"] as? String ?? ""
            var args: [String: AnyCodable] = [:]
            if let argsDict = json["args"] as? [String: Any] {
                args = argsDict.mapValues { AnyCodable($0) }
            }
            return .nativeToolRequest(NativeToolRequest(
                callId: callId,
                toolName: toolName,
                args: args
            ))

        case "native_tool_cancel":
            let callId = json["callId"] as? String ?? ""
            return .nativeToolCancel(callId: callId)

        default:
            return .unknown(type: type, raw: data)
        }
    }

    private func parseAssistantMessageEvent(from dict: [String: Any]) -> AssistantMessageEvent {
        // Server sends "assistantMessageEvent", extract event from it
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

    private func handleConnectionError(_ error: Error) {
        _isConnected = false

        // Fail all pending requests
        for (_, continuation) in pendingRequests {
            continuation.resume(throwing: AgentConnectionError.connectionLost(error.localizedDescription))
        }
        pendingRequests.removeAll()

        eventsContinuation?.yield(.relay(.error(code: "connection_lost", message: error.localizedDescription)))
        eventsContinuation?.finish()
    }

    private func handleStreamTermination() {
        // Clean up if stream is terminated externally
    }
}

// MARK: - Helper Types

extension URLSessionWebSocketTask.Message {
    var data: Data? {
        switch self {
        case .data(let data): return data
        case .string(let string): return string.data(using: .utf8)
        @unknown default: return nil
        }
    }
}
