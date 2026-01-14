//
//  WebSocketTransport.swift
//  PiCore
//
//  WebSocket-based RPC transport for remote server connections
//

import Foundation

/// WebSocket-based RPC transport for remote server connections
public actor WebSocketTransport: RPCTransport {

    // MARK: - Properties

    private let config: RPCTransportConfig
    private let connection: RPCConnection
    private let connectionState: ConnectionState

    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var receiveTask: Task<Void, Never>?

    private var _isConnected = false

    // MARK: - RPCTransport Protocol

    public var isConnected: Bool {
        _isConnected
    }

    public var connectionId: String? {
        get async {
            await connection.connectionId
        }
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
        self.connectionState = ConnectionState()
    }

    public init(
        config: RPCTransportConfig,
        maxReconnectAttempts: Int = 5,
        baseReconnectDelay: TimeInterval = 1.0
    ) {
        self.config = config
        self.connection = RPCConnection()
        self.connectionState = ConnectionState(
            maxReconnectAttempts: maxReconnectAttempts,
            baseReconnectDelay: baseReconnectDelay
        )
    }

    // MARK: - Connection

    public func connect() async throws {
        guard let serverURL = config.serverURL else {
            throw RPCTransportError.connectionFailed("No server URL configured")
        }

        await connectionState.setState(.connecting)

        // Create URLSession
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 300

        let session = URLSession(configuration: sessionConfig)
        self.urlSession = session

        // Build WebSocket URL (append /rpc path if not present)
        var wsURL = serverURL
        if !wsURL.path.hasSuffix("/rpc") {
            wsURL = serverURL.appendingPathComponent("rpc")
        }

        // Create WebSocket task
        let task = session.webSocketTask(with: wsURL)
        self.webSocketTask = task

        task.resume()

        // Start receiving messages
        startReceiving()

        // Send hello
        do {
            let resumeInfo = await connection.getResumeInfo()
            let helloResult: HelloResult = try await send(
                method: "hello",
                sessionId: nil,
                params: HelloParams(client: config.clientInfo, resume: resumeInfo)
            )

            await connection.setConnectionInfo(
                connectionId: helloResult.connectionId,
                capabilities: helloResult.capabilities
            )

            _isConnected = true
            await connectionState.setState(.connected)
        } catch {
            // Clean up on hello failure
            await cleanupConnection()
            throw error
        }
    }

    public func disconnect() async {
        _isConnected = false
        await connectionState.setState(.disconnected)
        await connectionState.cancelReconnect()

        await cleanupConnection()
        await connection.reset()
        await connection.finishEvents()
    }

    private func cleanupConnection() async {
        receiveTask?.cancel()
        receiveTask = nil

        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil

        urlSession?.invalidateAndCancel()
        urlSession = nil
    }

    // MARK: - Sending

    public func send<R: Decodable & Sendable>(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws -> R {
        let data = try await sendInternalRaw(method: method, sessionId: sessionId, params: params)

        let decoder = JSONDecoder()
        let response = try decoder.decode(WSResponse.self, from: data)

        guard response.ok, let result = response.result else {
            if let error = response.error {
                throw RPCTransportError.serverError(error)
            }
            throw RPCTransportError.invalidResponse("No result in response")
        }

        // Decode the actual result type from AnyCodable
        let resultData = try result.toJSONData()
        return try decoder.decode(R.self, from: resultData)
    }

    public func sendVoid(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws {
        let data = try await sendInternalRaw(method: method, sessionId: sessionId, params: params)

        let decoder = JSONDecoder()
        let response = try decoder.decode(WSResponse.self, from: data)

        if !response.ok, let error = response.error {
            throw RPCTransportError.serverError(error)
        }
    }

    private func sendInternalRaw(
        method: String,
        sessionId: String?,
        params: (any Encodable & Sendable)?
    ) async throws -> Data {
        // Allow hello to be sent before we're "connected"
        guard let webSocketTask, _isConnected || method == "hello" else {
            throw RPCTransportError.notConnected
        }

        let requestId = UUID().uuidString
        let request = WSRequest(
            id: requestId,
            sessionId: sessionId,
            method: method,
            params: params
        )

        let encoder = JSONEncoder()
        let requestData = try encoder.encode(request)

        return try await withCheckedThrowingContinuation { continuation in
            Task {
                await connection.registerRequest(
                    id: requestId,
                    method: method,
                    sessionId: sessionId,
                    continuation: continuation
                )

                do {
                    try await webSocketTask.send(.data(requestData))
                } catch {
                    // Remove pending request and fail
                    await connection.failRequest(
                        id: requestId,
                        error: RPCTransportError.connectionLost(error.localizedDescription)
                    )
                }
            }
        }
    }

    // MARK: - Receiving

    private func startReceiving() {
        receiveTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                do {
                    guard let task = await self.webSocketTask else { break }
                    let message = try await task.receive()

                    switch message {
                    case .data(let data):
                        await self.connection.processIncoming(data)
                    case .string(let text):
                        if let data = text.data(using: .utf8) {
                            await self.connection.processIncoming(data)
                        }
                    @unknown default:
                        break
                    }
                } catch {
                    // Connection lost
                    if !Task.isCancelled {
                        await self.handleConnectionLost(error: error)
                    }
                    break
                }
            }
        }
    }

    private func handleConnectionLost(error: Error) async {
        guard _isConnected else { return }

        _isConnected = false
        await connectionState.setState(.disconnected)

        // Attempt reconnection
        await attemptReconnect()
    }

    private func attemptReconnect() async {
        var attempt = 0

        while await connectionState.shouldAttemptReconnect(currentAttempt: attempt) {
            attempt += 1
            await connectionState.setState(.reconnecting(attempt: attempt))

            let delay = await connectionState.reconnectDelay(attempt: attempt)

            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            } catch {
                // Task cancelled
                break
            }

            // Clean up previous connection
            await cleanupConnection()

            do {
                try await connect()
                return // Success
            } catch {
                // Continue to next attempt
            }
        }

        // Failed all attempts - notify via events
        await connectionState.setState(.disconnected)
        await connection.finishEvents()
    }
}
