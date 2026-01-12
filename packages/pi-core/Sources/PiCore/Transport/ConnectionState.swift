//
//  ConnectionState.swift
//  PiCore
//
//  Manages reconnection state and resume logic
//

import Foundation

/// Connection state for managing reconnection
public actor ConnectionState {

    /// Connection state enum
    public enum State: Sendable, Equatable {
        case disconnected
        case connecting
        case connected
        case reconnecting(attempt: Int)
    }

    /// Current state
    public private(set) var state: State = .disconnected

    /// Task handling reconnection
    private var reconnectTask: Task<Void, Never>?

    /// Maximum reconnection attempts
    public let maxReconnectAttempts: Int

    /// Base delay between reconnection attempts (exponential backoff)
    public let baseReconnectDelay: TimeInterval

    /// Maximum delay between reconnection attempts
    public let maxReconnectDelay: TimeInterval

    // MARK: - Initialization

    public init(
        maxReconnectAttempts: Int = 5,
        baseReconnectDelay: TimeInterval = 1.0,
        maxReconnectDelay: TimeInterval = 30.0
    ) {
        self.maxReconnectAttempts = maxReconnectAttempts
        self.baseReconnectDelay = baseReconnectDelay
        self.maxReconnectDelay = maxReconnectDelay
    }

    // MARK: - Public Interface

    /// Update the connection state
    public func setState(_ newState: State) {
        state = newState
    }

    /// Check if reconnection should be attempted
    public func shouldAttemptReconnect(currentAttempt: Int) -> Bool {
        currentAttempt < maxReconnectAttempts
    }

    /// Calculate delay for reconnection attempt with exponential backoff and jitter
    public func reconnectDelay(attempt: Int) -> TimeInterval {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
        let base = baseReconnectDelay * pow(2.0, Double(attempt))
        // Add jitter (0-30% of base delay)
        let jitter = Double.random(in: 0...0.3) * base
        // Cap at max delay
        return min(base + jitter, maxReconnectDelay)
    }

    /// Set reconnect task for cancellation tracking
    public func setReconnectTask(_ task: Task<Void, Never>?) {
        reconnectTask = task
    }

    /// Cancel any ongoing reconnection attempt
    public func cancelReconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
    }

    /// Check if currently in a reconnecting state
    public var isReconnecting: Bool {
        if case .reconnecting = state {
            return true
        }
        return false
    }

    /// Check if connected
    public var isConnected: Bool {
        state == .connected
    }
}
