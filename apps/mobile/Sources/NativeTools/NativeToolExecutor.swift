//
//  NativeToolExecutor.swift
//  Pi
//
//  Dispatches native tool requests to tool implementations
//

import Foundation
import PiCore

/// Error types for native tool execution.
public enum NativeToolError: Error, LocalizedError, Sendable {
    case unknownTool(String)
    case executionFailed(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .unknownTool(let name):
            return "Unknown native tool: \(name)"
        case .executionFailed(let reason):
            return "Tool execution failed: \(reason)"
        case .cancelled:
            return "Tool execution was cancelled"
        }
    }
}

/// Thread-safe cancellation flag
private final class CancellationFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var _isCancelled = false

    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return _isCancelled
    }

    func cancel() {
        lock.lock()
        defer { lock.unlock() }
        _isCancelled = true
    }
}

/// Dispatches native tool requests to the appropriate tool implementation.
public actor NativeToolExecutor {
    /// Active tool executions that can be cancelled.
    private var activeCalls: [String: CancellationFlag] = [:]

    public init() {}

    /// Execute a native tool request.
    /// Returns result as JSON Data for safe crossing of actor boundaries.
    public func execute(request: NativeToolRequest) async throws -> Data {
        guard let tool = NativeTool.find(request.toolName) else {
            throw NativeToolError.unknownTool(request.toolName)
        }

        let cancellationFlag = CancellationFlag()
        let onCancel: @Sendable () -> Void = { [cancellationFlag] in
            cancellationFlag.cancel()
        }

        // Track this call for potential cancellation
        activeCalls[request.callId] = cancellationFlag

        defer {
            activeCalls.removeValue(forKey: request.callId)
        }

        // Execute the tool
        let executor = tool.makeExecutor()
        let result = try await executor.execute(args: request.args, onCancel: onCancel)

        if cancellationFlag.isCancelled {
            throw NativeToolError.cancelled
        }

        // Serialize to JSON for safe actor boundary crossing
        return try JSONSerialization.data(withJSONObject: result)
    }

    /// Cancel a pending tool execution.
    public func cancel(callId: String) {
        if let flag = activeCalls[callId] {
            flag.cancel()
            activeCalls.removeValue(forKey: callId)
        }
    }
}
