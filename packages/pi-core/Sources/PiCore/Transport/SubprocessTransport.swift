//
//  SubprocessTransport.swift
//  PiCore
//
//  Subprocess-based RPC transport for local pi agent
//  macOS only - iOS cannot spawn subprocesses
//

#if os(macOS)

import Foundation

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

/// Subprocess-based RPC transport for local pi agent
public actor SubprocessTransport: RPCTransport {

    // MARK: - Properties

    private let config: RPCTransportConfig
    private let connection: RPCConnection

    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?

    private var readBuffer = Data()
    private var _isConnected = false

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
        process.currentDirectoryPath = workingDirectory

        // Set environment
        var env = ProcessInfo.processInfo.environment
        if let customEnv = config.environment {
            for (key, value) in customEnv {
                env[key] = value
            }
        }
        process.environment = env

        // Set termination handler
        process.terminationHandler = { [weak self] proc in
            Task { [weak self] in
                await self?.handleProcessTermination(exitCode: proc.terminationStatus)
            }
        }

        self.process = process

        // Start reading stdout
        startReadingStdout()

        // Launch process
        do {
            try process.run()
        } catch {
            cleanup()
            throw RPCTransportError.connectionFailed("Failed to launch process: \(error.localizedDescription)")
        }

        _isConnected = true

        // Wait briefly to check for immediate crash
        try await Task.sleep(nanoseconds: 200_000_000)

        if !process.isRunning {
            _isConnected = false
            cleanup()
            throw RPCTransportError.connectionFailed("Process terminated immediately")
        }
    }

    public func disconnect() async {
        _isConnected = false

        if let process, process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }

        cleanup()
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
        guard _isConnected, let stdinPipe else {
            throw RPCTransportError.notConnected
        }

        // Build legacy command format
        // The subprocess expects: {"type": "method_name", ...params}
        var commandDict: [String: Any] = ["type": method]

        if let params {
            let encoder = JSONEncoder()

            // Encode the params directly (not wrapped in AnyCodable)
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

                // Then write to stdin
                do {
                    try self.stdinPipe?.fileHandleForWriting.write(contentsOf: lineData)
                } catch {
                    await self.connection.failRequest(
                        id: method,
                        error: RPCTransportError.connectionLost("Pipe broken")
                    )
                }
            }
        }
    }

    // MARK: - Reading

    private func startReadingStdout() {
        guard let stdoutPipe else { return }

        let handle = stdoutPipe.fileHandleForReading

        handle.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }

            Task { [weak self] in
                await self?.processStdoutData(data)
            }
        }
    }

    private func processStdoutData(_ data: Data) async {
        readBuffer.append(data)

        // Process complete lines
        while let newlineIndex = readBuffer.firstIndex(of: 0x0A) {
            let lineData = readBuffer.prefix(upTo: newlineIndex)
            readBuffer = Data(readBuffer.suffix(from: readBuffer.index(after: newlineIndex)))

            guard !lineData.isEmpty else { continue }

            // Strip ANSI escape codes and find JSON start
            guard let lineString = String(data: Data(lineData), encoding: .utf8) else {
                continue
            }

            // Strip ANSI/OSC escape sequences (defensive measure for extensions that output them)
            let cleanedString = stripANSIEscapeCodes(lineString)

            guard let jsonStartIndex = cleanedString.firstIndex(of: "{") else {
                continue
            }

            let jsonString = String(cleanedString[jsonStartIndex...])
            guard let cleanedData = jsonString.data(using: .utf8) else {
                continue
            }

            await connection.processIncoming(cleanedData)
        }
    }

    /// Strip ANSI escape codes from a string
    private func stripANSIEscapeCodes(_ string: String) -> String {
        // Match multiple types of escape sequences:
        // 1. CSI sequences: ESC[ followed by parameters and a command letter
        // 2. OSC sequences: ESC] followed by content ending with BEL (\u{07}) or ST (ESC\)
        let patterns = [
            "\\x1b\\[[0-9;]*[a-zA-Z]",           // CSI sequences
            "\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)?"   // OSC sequences (BEL or ST terminator)
        ]
        let combined = patterns.joined(separator: "|")
        guard let regex = try? NSRegularExpression(pattern: combined) else {
            return string
        }
        let range = NSRange(string.startIndex..., in: string)
        return regex.stringByReplacingMatches(in: string, range: range, withTemplate: "")
    }

    // MARK: - Process Lifecycle

    private func handleProcessTermination(exitCode: Int32) async {
        _isConnected = false
        await connection.reset()
        await connection.finishEvents()
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

#endif
