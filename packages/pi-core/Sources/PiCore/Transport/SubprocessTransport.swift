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

/// Subprocess-based RPC transport for local pi agent using Foundation Process
/// Uses dedicated threads for pipe I/O to avoid buffer blocking issues
public actor SubprocessTransport: RPCTransport {

    // MARK: - Properties

    private let config: RPCTransportConfig
    private let connection: RPCConnection

    private var _isConnected = false
    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var stdoutThread: Thread?
    private var stderrThread: Thread?

    // MARK: - RPCTransport Protocol

    public var isConnected: Bool {
        _isConnected
    }

    public var connectionId: String? {
        nil
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

        guard FileManager.default.fileExists(atPath: executablePath) else {
            throw RPCTransportError.connectionFailed("Executable not found at \(executablePath)")
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executablePath)
        proc.arguments = ["--mode", "rpc"]
        proc.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

        // Set environment
        var env = ProcessInfo.processInfo.environment
        if let customEnv = config.environment {
            for (key, value) in customEnv {
                env[key] = value
            }
        }
        proc.environment = env

        // Setup pipes
        let stdin = Pipe()
        let stdout = Pipe()
        let stderr = Pipe()
        proc.standardInput = stdin
        proc.standardOutput = stdout
        proc.standardError = stderr

        self.process = proc
        self.stdinPipe = stdin
        self.stdoutPipe = stdout
        self.stderrPipe = stderr

        // Capture connection for thread callbacks
        let conn = self.connection

        // Start stdout reading thread - use a helper to avoid capturing self
        let outThread = Thread { [weak self] in
            let transport = self
            Self.readPipeLines(stdout.fileHandleForReading) { line in
                Task {
                    await transport?.processLine(line, connection: conn)
                }
            }
        }
        outThread.name = "SubprocessTransport-stdout"
        outThread.start()
        self.stdoutThread = outThread

        // Start stderr reading thread
        let errThread = Thread {
            Self.readPipeLines(stderr.fileHandleForReading) { line in
                print("[SubprocessTransport] stderr: \(line)")
            }
        }
        errThread.name = "SubprocessTransport-stderr"
        errThread.start()
        self.stderrThread = errThread

        // Start the process
        do {
            try proc.run()
            _isConnected = true
        } catch {
            throw RPCTransportError.connectionFailed("Failed to start process: \(error)")
        }

        // Setup termination handler
        proc.terminationHandler = { [weak self] _ in
            Task {
                await self?.handleProcessTermination()
            }
        }
    }

    /// Read lines from a pipe on the current thread (blocking)
    private static func readPipeLines(_ handle: FileHandle, onLine: @escaping (String) -> Void) {
        var buffer = Data()
        while true {
            let chunk = handle.availableData
            if chunk.isEmpty {
                break // EOF
            }
            buffer.append(chunk)

            // Process complete lines
            while let newlineIndex = buffer.firstIndex(of: 0x0A) {
                let lineData = buffer[..<newlineIndex]
                buffer = Data(buffer[(newlineIndex + 1)...])
                if let line = String(data: lineData, encoding: .utf8) {
                    onLine(line)
                }
            }
        }
        // Process any remaining data
        if !buffer.isEmpty, let line = String(data: buffer, encoding: .utf8) {
            onLine(line)
        }
    }

    public func disconnect() async {
        _isConnected = false

        stdinPipe?.fileHandleForWriting.closeFile()
        process?.terminate()
        process = nil
        stdinPipe = nil
        stdoutPipe = nil
        stderrPipe = nil
        stdoutThread = nil
        stderrThread = nil

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

        // Build legacy command format: {"type": "method_name", ...params}
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
                await self.connection.registerRequest(
                    id: method,
                    method: method,
                    sessionId: sessionId,
                    continuation: continuation
                )

                // Write to stdin
                stdinPipe.fileHandleForWriting.write(lineData)
            }
        }
    }

    // MARK: - Reading

    private func processLine(_ line: String, connection: RPCConnection) async {
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

    nonisolated private func stripANSIEscapeCodes(_ string: String) -> String {
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
        stdinPipe = nil
        stdoutPipe = nil
        stderrPipe = nil
        process = nil
        stdoutThread = nil
        stderrThread = nil
        await connection.reset()
        await connection.finishEvents()
    }
}

#endif
