//
//  PiConnection.swift
//  pi
//
//  Unified interface for local subprocess and remote WebSocket connections
//

import Foundation
import PiCore

/// Unified interface for local and remote connections
@MainActor
public protocol PiConnection: AnyObject, Sendable {
    var isConnected: Bool { get }

    func connect() async throws
    func disconnect() async

    func prompt(_ message: String, streamingBehavior: StreamingBehavior?) async throws
    func abort() async throws

    func subscribe() -> AsyncStream<RPCEvent>

    func getAvailableModels() async throws -> GetAvailableModelsResponse
    func setModel(provider: String, modelId: String) async throws
    func getState() async throws -> GetStateResponse
}
