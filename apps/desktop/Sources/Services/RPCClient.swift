//
//  RPCClient.swift
//  pi
//
//  Created by Aliou Diallo on 2026-01-07.
//

import Foundation
import PiCore

// MARK: - RPC Client Errors

enum RPCClientError: Error, LocalizedError {
    case notRunning
    case processTerminated(exitCode: Int32)
    case encodingFailed
    case decodingFailed(String)
    case requestTimeout
    case requestCancelled
    case invalidResponse(String)
    case serverError(RPCError)
    case pipeBroken
    case alreadyRunning
    case noModelsAvailable

    var errorDescription: String? {
        switch self {
        case .notRunning:
            return "RPC client is not running"
        case .processTerminated(let code):
            return "Process terminated with exit code \(code)"
        case .encodingFailed:
            return "Failed to encode command"
        case .decodingFailed(let details):
            return "Failed to decode response: \(details)"
        case .requestTimeout:
            return "Request timed out"
        case .requestCancelled:
            return "Request was cancelled"
        case .invalidResponse(let details):
            return "Invalid response: \(details)"
        case .serverError(let error):
            return error.message
        case .pipeBroken:
            return "Communication pipe is broken"
        case .alreadyRunning:
            return "RPC client is already running"
        case .noModelsAvailable:
            return "No API keys configured"
        }
    }

    /// Whether this error requires authentication setup
    var requiresAuthSetup: Bool {
        switch self {
        case .noModelsAvailable:
            return true
        default:
            return false
        }
    }
}

// MARK: - RPC Client Actor

/// Actor-based RPC client that manages a subprocess communicating via JSONL over stdin/stdout
actor RPCClient {
    // MARK: - Types

    private struct PendingRequest {
        let command: String
        let continuation: CheckedContinuation<Data, Error>
        let timestamp: Date
    }

    // MARK: - Properties

    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?

    private var pendingRequests: [String: PendingRequest] = [:]
    private var requestIdCounter: UInt64 = 0

    private var eventsContinuation: AsyncStream<RPCEvent>.Continuation?
    private var _events: AsyncStream<RPCEvent>?

    private var readBuffer = Data()
    private var stderrBuffer = ""
    private var isRunning = false
    private var detectedNoModels = false

    private let executablePath: String
    private let environment: [String: String]?

    // MARK: - Initialization

    init(
        executablePath: String? = nil,
        environment: [String: String]? = nil
    ) {
        self.executablePath = executablePath ?? RPCClient.defaultExecutablePath
        self.environment = environment
    }

    deinit {
        // Clean up is handled by stop(), but ensure process is terminated
        process?.terminate()
    }

    // MARK: - Public Interface

    /// Stream of events from the RPC server
    var events: AsyncStream<RPCEvent> {
        get async {
            if let existing = _events {
                return existing
            }

            let (stream, continuation) = AsyncStream<RPCEvent>.makeStream(bufferingPolicy: .bufferingNewest(100))
            self.eventsContinuation = continuation
            self._events = stream
            return stream
        }
    }

    /// Whether the client is currently running
    var running: Bool {
        isRunning
    }

    /// Start the RPC subprocess
    /// - Parameters:
    ///   - workingDirectory: Directory where pi should run (the project directory)
    func start(workingDirectory: String) async throws {
        guard !isRunning else {
            throw RPCClientError.alreadyRunning
        }

        // Create pipes
        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()

        self.stdinPipe = stdinPipe
        self.stdoutPipe = stdoutPipe
        self.stderrPipe = stderrPipe

        // Configure process
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executablePath)
        process.arguments = ["--mode", "rpc"]
        process.standardInput = stdinPipe
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        // Set working directory
        process.currentDirectoryPath = workingDirectory

        // Set up environment with PI_AGENT_DIR (single location for all sessions)
        var env = ProcessInfo.processInfo.environment
        env["PI_CODING_AGENT_DIR"] = AppPaths.agentPath
        if let customEnv = environment {
            for (key, value) in customEnv {
                env[key] = value
            }
        }
        process.environment = env

        // Set up termination handler
        process.terminationHandler = { [weak self] proc in
            Task { [weak self] in
                await self?.handleProcessTermination(exitCode: proc.terminationStatus)
            }
        }

        self.process = process

        // Start reading stdout
        startReadingStdout()
        startReadingStderr()

        // Reset detection state
        detectedNoModels = false
        stderrBuffer = ""

        // Launch process
        do {
            try process.run()
            isRunning = true
        } catch {
            cleanup()
            throw error
        }

        // Wait briefly to check if process crashes immediately (e.g., no API keys)
        try await Task.sleep(nanoseconds: 200_000_000) // 200ms

        // Check if process died during startup
        if !process.isRunning {
            isRunning = false
            cleanup()

            if detectedNoModels {
                throw RPCClientError.noModelsAvailable
            }
            throw RPCClientError.processTerminated(exitCode: process.terminationStatus)
        }
    }

    /// Stop the RPC subprocess
    func stop() async {
        guard isRunning else { return }

        isRunning = false

        // Cancel all pending requests
        for (_, request) in pendingRequests {
            request.continuation.resume(throwing: RPCClientError.requestCancelled)
        }
        pendingRequests.removeAll()

        // Terminate process
        if let process, process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }

        cleanup()

        // End event stream
        eventsContinuation?.finish()
    }

    /// Send a command and wait for response
    func send<C: RPCCommand, R: Decodable & Sendable>(_ command: C) async throws -> R {
        guard isRunning else {
            throw RPCClientError.notRunning
        }

        guard let stdinPipe else {
            throw RPCClientError.pipeBroken
        }

        let commandType = command.type

        // Encode command to JSON (pi expects camelCase keys)
        let encoder = JSONEncoder()

        let jsonData: Data
        do {
            jsonData = try encoder.encode(command)
        } catch {
            throw RPCClientError.encodingFailed
        }

        // Add newline for JSONL format
        var lineData = jsonData
        lineData.append(contentsOf: [0x0A]) // newline

        // Create pending request and send
        let responseData: Data = try await withCheckedThrowingContinuation { continuation in
            let requestId = commandType // Use command type as request ID for now

            pendingRequests[requestId] = PendingRequest(
                command: commandType,
                continuation: continuation,
                timestamp: Date()
            )

            // Write to stdin
            do {
                try stdinPipe.fileHandleForWriting.write(contentsOf: lineData)
            } catch {
                pendingRequests.removeValue(forKey: requestId)
                continuation.resume(throwing: RPCClientError.pipeBroken)
            }
        }

        // Decode response
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        do {
            let response = try decoder.decode(RPCResponse<R>.self, from: responseData)

            if response.success, let data = response.data {
                return data
            }
            if let error = response.error {
                throw RPCClientError.serverError(error)
            }
            throw RPCClientError.invalidResponse("No data in successful response")
        } catch let error as RPCClientError {
            throw error
        } catch {
            throw RPCClientError.decodingFailed(error.localizedDescription)
        }
    }

    /// Send a command that returns no data (void response)
    func send<C: RPCCommand>(_ command: C) async throws {
        guard isRunning else {
            throw RPCClientError.notRunning
        }

        guard let stdinPipe else {
            throw RPCClientError.pipeBroken
        }

        let commandType = command.type

        // Encode command to JSON (pi expects camelCase keys)
        let encoder = JSONEncoder()

        let jsonData: Data
        do {
            jsonData = try encoder.encode(command)
        } catch {
            throw RPCClientError.encodingFailed
        }

        // Add newline for JSONL format
        var lineData = jsonData
        lineData.append(contentsOf: [0x0A])

        // For void responses, we still wait for acknowledgment
        let _: Data = try await withCheckedThrowingContinuation { continuation in
            let requestId = commandType

            pendingRequests[requestId] = PendingRequest(
                command: commandType,
                continuation: continuation,
                timestamp: Date()
            )

            do {
                try stdinPipe.fileHandleForWriting.write(contentsOf: lineData)
            } catch {
                pendingRequests.removeValue(forKey: requestId)
                continuation.resume(throwing: RPCClientError.pipeBroken)
            }
        }
    }

    /// Send a prompt to the agent
    func prompt(_ message: String) async throws {
        let command = PromptCommand(message: message)
        try await send(command) as Void
    }

    /// Abort ongoing operation
    func abort() async throws {
        let command = AbortCommand()
        try await send(command) as Void
    }

    /// Get current state
    func getState() async throws -> GetStateResponse {
        let command = GetStateCommand()
        return try await send(command)
    }

    /// Get available models
    func getAvailableModels() async throws -> GetAvailableModelsResponse {
        let command = GetAvailableModelsCommand()
        return try await send(command)
    }

    /// Set the active model
    func setModel(provider: String, modelId: String) async throws {
        let command = SetModelCommand(provider: provider, modelId: modelId)
        try await send(command) as Void
    }

    /// Get conversation history
    func getMessages() async throws -> GetMessagesResponse {
        let command = GetMessagesCommand()
        return try await send(command)
    }

    /// Clear conversation
    func clearConversation() async throws {
        let command = ClearConversationCommand()
        try await send(command) as Void
    }

    /// Start a new session
    func newSession() async throws -> NewSessionResponse {
        let command = NewSessionCommand()
        return try await send(command)
    }

    /// Switch to an existing session file
    func switchSession(sessionPath: String) async throws -> SwitchSessionResponse {
        let command = SwitchSessionCommand(sessionPath: sessionPath)
        return try await send(command)
    }

    // MARK: - Private Methods

    private func startReadingStdout() {
        guard let stdoutPipe else { return }

        let handle = stdoutPipe.fileHandleForReading

        handle.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                // EOF - pipe closed
                handle.readabilityHandler = nil
                return
            }

            Task { [weak self] in
                await self?.processStdoutData(data)
            }
        }
    }

    private func startReadingStderr() {
        guard let stderrPipe else { return }

        let handle = stderrPipe.fileHandleForReading

        handle.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }

            // Log stderr for debugging and detect specific errors
            if let text = String(data: data, encoding: .utf8) {
                logWarn("pi stderr: \(text.trimmingCharacters(in: .whitespacesAndNewlines))")

                // Check for "No models available" error
                Task { [weak self] in
                    await self?.appendStderr(text)
                }
            }
        }
    }

    private func appendStderr(_ text: String) {
        stderrBuffer += text
        if stderrBuffer.contains("No models available") {
            detectedNoModels = true
        }
    }

    private func processStdoutData(_ data: Data) {
        readBuffer.append(data)

        // Process complete lines
        while let newlineIndex = readBuffer.firstIndex(of: 0x0A) {
            let lineData = readBuffer.prefix(upTo: newlineIndex)
            readBuffer = Data(readBuffer.suffix(from: readBuffer.index(after: newlineIndex)))

            guard !lineData.isEmpty else { continue }

            processLine(Data(lineData))
        }
    }

    private func processLine(_ lineData: Data) {
        // Strip terminal escape sequences and find the JSON start
        guard let lineString = String(data: lineData, encoding: .utf8) else {
            return
        }

        // Find the first '{' which starts the JSON object
        guard let jsonStartIndex = lineString.firstIndex(of: "{") else {
            // Not a JSON line, skip (might be terminal escape sequence)
            return
        }

        let jsonString = String(lineString[jsonStartIndex...])
        guard let cleanedData = jsonString.data(using: .utf8) else {
            return
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        // First, decode to determine message type
        let rawMessage: RawRPCMessage
        do {
            rawMessage = try decoder.decode(RawRPCMessage.self, from: cleanedData)
        } catch {
            // Only log if it looks like it should be valid JSON (starts with {"type":)
            if jsonString.hasPrefix("{\"type\":") {
                logError("Failed to decode RPC message: \(error.localizedDescription)\nJSON: \(jsonString.prefix(500))")
            }
            return
        }

        if rawMessage.type == "response" {
            // This is a response to a pending request
            handleResponse(rawMessage, rawData: cleanedData)
        } else {
            // This is an event
            handleEvent(rawMessage, rawData: cleanedData)
        }
    }

    private func handleResponse(_ message: RawRPCMessage, rawData: Data) {
        guard let command = message.command else {
            logWarn("Response missing command field")
            return
        }

        // Find and complete pending request
        if let pending = pendingRequests.removeValue(forKey: command) {
            pending.continuation.resume(returning: rawData)
        } else {
            logWarn("Received response for unknown command: \(command)")
        }
    }

    private func handleEvent(_ message: RawRPCMessage, rawData: Data) {
        let event: RPCEvent

        switch message.type {
        case "agent_start":
            event = .agentStart

        case "agent_end":
            event = .agentEnd(success: true, error: nil)

        case "turn_start":
            event = .turnStart

        case "turn_end":
            event = .turnEnd

        case "message_start":
            event = .messageStart(messageId: message.messageId)

        case "message_end":
            event = .messageEnd(stopReason: message.stopReason)

        case "auto_compaction_start":
            event = .autoCompactionStart

        case "auto_compaction_end":
            event = .autoCompactionEnd

        case "auto_retry_start":
            event = .autoRetryStart(
                attempt: message.attempt ?? 0,
                maxAttempts: message.maxAttempts ?? 0,
                delayMs: message.delayMs ?? 0,
                errorMessage: message.errorMessage ?? ""
            )

        case "auto_retry_end":
            event = .autoRetryEnd(
                success: message.success ?? false,
                attempt: message.attempt ?? 0,
                finalError: message.finalError
            )

        case "hook_error", "extension_error":
            event = .hookError(
                extensionPath: message.extensionPath,
                event: message.event,
                error: message.errorMessage
            )

        case "message_update":
            if let assistantEvent = message.assistantMessageEvent {
                event = .messageUpdate(message: message.message, event: assistantEvent)
            } else {
                event = .unknown(type: message.type, raw: rawData)
            }

        case "tool_execution_start":
            if let toolCallId = message.toolCallId, let toolName = message.toolName {
                event = .toolExecutionStart(
                    toolCallId: toolCallId,
                    toolName: toolName,
                    args: message.args
                )
            } else {
                event = .unknown(type: message.type, raw: rawData)
            }

        case "tool_execution_update":
            if let toolCallId = message.toolCallId {
                // Extract text from partialResult.content
                let output = message.partialResult?.content?
                    .compactMap(\.text)
                    .joined(separator: "\n") ?? ""
                event = .toolExecutionUpdate(toolCallId: toolCallId, output: output)
            } else {
                event = .unknown(type: message.type, raw: rawData)
            }

        case "tool_execution_end":
            if let toolCallId = message.toolCallId {
                let status: ToolStatus = (message.isError == true) ? .error : .success
                // Extract text from result.content
                let output = message.result?.content?
                    .compactMap(\.text)
                    .joined(separator: "\n")
                event = .toolExecutionEnd(
                    toolCallId: toolCallId,
                    output: output,
                    status: status
                )
            } else {
                event = .unknown(type: message.type, raw: rawData)
            }

        case "state_update":
            if let context = message.context {
                event = .stateUpdate(context: context)
            } else {
                event = .unknown(type: message.type, raw: rawData)
            }

        default:
            event = .unknown(type: message.type, raw: rawData)
        }

        eventsContinuation?.yield(event)
    }

    private func handleProcessTermination(exitCode: Int32) {
        isRunning = false

        // Fail all pending requests
        for (_, request) in pendingRequests {
            request.continuation.resume(throwing: RPCClientError.processTerminated(exitCode: exitCode))
        }
        pendingRequests.removeAll()

        // Notify via events and close stream
        if exitCode != 0 {
            eventsContinuation?.yield(.agentEnd(
                success: false,
                error: RPCError(code: "process_exit", message: "Process exited with code \(exitCode)", details: nil)
            ))
        }
        eventsContinuation?.finish()

        cleanup()
    }

    private func cleanup() {
        stdinPipe?.fileHandleForWriting.closeFile()
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil

        stdinPipe = nil
        stdoutPipe = nil
        stderrPipe = nil
        process = nil
        readBuffer = Data()
    }
}

// MARK: - Convenience Extensions

extension RPCClient {
    /// Default path to the pi executable (from Application Support)
    nonisolated static var defaultExecutablePath: String {
        AppPaths.piExecutablePath
    }

    /// Create a client configured for development
    nonisolated static func development() -> RPCClient {
        RPCClient(
            executablePath: defaultExecutablePath,
            environment: ["PI_ENV": "development"]
        )
    }

    /// Create a client with custom executable path
    nonisolated static func withExecutable(_ path: String) -> RPCClient {
        RPCClient(executablePath: path)
    }
}
