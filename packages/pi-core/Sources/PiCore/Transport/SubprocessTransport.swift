//
//  SubprocessTransport.swift
//  PiCore
//
//  Subprocess-based RPC transport for local pi agent
//  macOS only - iOS cannot spawn subprocesses
//

#if os(macOS)

import Foundation
import Subprocess
import System

/// Type-erasing wrapper for Encodable values
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        encodeFunc = { encoder in
            try value.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}

/// Subprocess-based RPC transport for local pi agent using Swift Subprocess
public actor SubprocessTransport: RPCTransport {

    // MARK: - Properties

    private let config: RPCTransportConfig
    private let connection: RPCConnection

    private var _isConnected = false
    private var subprocessTask: Task<Void, Never>?
    private var stdinContinuation: AsyncStream<Data>.Continuation?

    // MARK: - RPCTransport Protocol

    public var isConnected: Bool {
        _isConnected
    }

    public var connectionId: String? {
        nil // Subprocess doesn't use connection IDs
    }

    public var events: AsyncStream<TransportEvent> {
        get async {
            await connection.events
        }
    }

    // MARK: - Initialization

    public init(config: RPCTransportConfig) {
        self.config = config
        self.connection = RPCConnection()
    }

    // MARK: - Connection

    public func connect() async throws {
        guard let workingDirectory = config.workingDirectory,
              let executablePath = config.executablePath else {
            throw RPCTransportError.connectionFailed("Missing working directory or executable path")
        }

        // Verify executable exists
        guard FileManager.default.fileExists(atPath: executablePath) else {
            throw RPCTransportError.connectionFailed("Executable not found at \(executablePath)")
        }

        // Create async stream for stdin writes
        let (stdinStream, stdinContinuation) = AsyncStream<Data>.makeStream()
        self.stdinContinuation = stdinContinuation

        // Build environment with custom PI_CODING_AGENT_DIR
        let env: Environment
        if let customEnv = config.environment, !customEnv.isEmpty {
            var envUpdates: [Environment.Key: String?] = [:]
            for (key, value) in customEnv {
                envUpdates[Environment.Key(stringLiteral: key)] = value
            }
            env = .inherit.updating(envUpdates)
        } else {
            env = .inherit
        }

        let execPath = executablePath
        let workDir = workingDirectory

        // Start subprocess in background task
        subprocessTask = Task { [weak self] in
            do {
                _ = try await Subprocess.run(
                    .path(FilePath(execPath)),
                    arguments: ["--mode", "rpc"],
                    environment: env,
                    workingDirectory: FilePath(workDir)
                ) { _, stdin, stdout, stderr in

                    // Mark as connected
                    await self?.setConnected(true)

                    await withTaskGroup(of: Void.self) { group in
                        // Task to write stdin from our stream
                        group.addTask {
                            for await data in stdinStream {
                                do {
                                    _ = try await stdin.write(Array(data))
                                } catch {
                                    break
                                }
                            }
                            try? await stdin.finish()
                        }

                        // Task to read stdout lines
                        group.addTask { [weak self] in
                            do {
                                for try await line in stdout.lines() {
                                    await self?.processLine(line)
                                }
                            } catch {
                                // Stream ended or error
                            }
                        }

                        // Task to log stderr
                        group.addTask {
                            do {
                                for try await line in stderr.lines() {
                                    print("[SubprocessTransport] stderr: \(line)")
                                }
                            } catch {
                                // Stream ended or error
                            }
                        }

                        await group.waitForAll()
                    }
                }
            } catch {
                print("[SubprocessTransport] Subprocess error: \(error)")
            }

            // Process terminated
            await self?.handleProcessTermination()
        }

        // Wait briefly to check for immediate crash
        try await Task.sleep(for: .milliseconds(200))

        if !_isConnected {
            throw RPCTransportError.connectionFailed("Process failed to start")
        }
    }

    private func setConnected(_ connected: Bool) {
        _isConnected = connected
    }

    public func disconnect() async {
        _isConnected = false

        // Close stdin stream to signal subprocess to exit
        stdinContinuation?.finish()
        stdinContinuation = nil

        // Cancel the subprocess task
        subprocessTask?.cancel()
        subprocessTask = nil

        await connection.reset()
        await connection.finishEvents()
    }

    // MARK: - Sending

    public func send<R: Decodable & Sendable>(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws -> R {
        let data = try await sendInternal(method: method, sessionId: sessionId, params: params)

        // Decode response format
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        let response = try decoder.decode(RPCResponse<R>.self, from: data)

        if response.success, let result = response.data {
            return result
        }
        if let error = response.error {
            throw RPCTransportError.serverError(error)
        }
        throw RPCTransportError.invalidResponse("No data in response")
    }

    public func sendVoid(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws {
        let _: Data = try await sendInternal(method: method, sessionId: sessionId, params: params)
    }

    private func sendInternal(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws -> Data {
        guard _isConnected, let stdinContinuation else {
            throw RPCTransportError.notConnected
        }

        // Build legacy command format
        // The subprocess expects: {"type": "method_name", ...params}
        var commandDict: [String: Any] = ["type": method]

        if let params {
            let encoder = JSONEncoder()
            let paramsData = try encoder.encode(AnyEncodable(params))
            if let paramsDict = try JSONSerialization.jsonObject(with: paramsData) as? [String: Any] {
                for (key, value) in paramsDict where key != "type" {
                    commandDict[key] = value
                }
            }
        }

        let jsonData = try JSONSerialization.data(withJSONObject: commandDict)
        var lineData = jsonData
        lineData.append(0x0A) // newline

        return try await withCheckedThrowingContinuation { continuation in
            Task {
                // Register request first (using method as ID for legacy format matching)
                await self.connection.registerRequest(
                    id: method,
                    method: method,
                    sessionId: sessionId,
                    continuation: continuation
                )

                // Write to stdin via the stream
                stdinContinuation.yield(lineData)
            }
        }
    }

    // MARK: - Reading

    private func processLine(_ line: String) async {
        // Strip ANSI/OSC escape sequences
        let cleanedString = stripANSIEscapeCodes(line)

        guard let jsonStartIndex = cleanedString.firstIndex(of: "{") else {
            return
        }

        let jsonString = String(cleanedString[jsonStartIndex...])
        guard let data = jsonString.data(using: .utf8) else {
            return
        }

        await connection.processIncoming(data)
    }

    /// Strip ANSI escape codes from a string
    private nonisolated func stripANSIEscapeCodes(_ string: String) -> String {
        // Match multiple types of escape sequences:
        // 1. CSI sequences: ESC[ followed by parameters and a command letter
        // 2. OSC sequences: ESC] followed by content ending with BEL (\u{07}) or ST (ESC\)
        let patterns = [
            "\\x1b\\[[0-9;]*[a-zA-Z]",
            "\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?"
        ]
        let combined = patterns.joined(separator: "|")
        guard let regex = try? NSRegularExpression(pattern: combined) else {
            return string
        }
        let range = NSRange(string.startIndex..., in: string)
        return regex.stringByReplacingMatches(in: string, range: range, withTemplate: "")
    }

    // MARK: - Process Lifecycle

    private func handleProcessTermination() async {
        _isConnected = false
        stdinContinuation?.finish()
        stdinContinuation = nil
        subprocessTask = nil
        await connection.reset()
        await connection.finishEvents()
    }
}

#endif
