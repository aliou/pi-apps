//
//  NativeToolExecutor.swift
//  pi
//
//  Executes native tool requests
//

import Foundation
import PiCore

/// Executes native tool requests
actor NativeToolExecutor {
    private var runningTasks: [String: Task<Void, Never>] = [:]

    func execute(request: NativeToolRequest) async throws -> Data {
        guard let tool = NativeTool(rawValue: request.toolName) else {
            throw NativeToolError.unknownTool(request.toolName)
        }

        guard tool.isAvailable else {
            throw NativeToolError.executionFailed("Tool not available on this device")
        }

        let executor = tool.makeExecutor()

        // Convert args to [String: Any]
        var input: [String: Any] = [:]
        for (key, value) in request.args {
            input[key] = value.value
        }

        return try await executor.execute(input: input)
    }

    func cancel(callId: String) {
        runningTasks[callId]?.cancel()
        runningTasks.removeValue(forKey: callId)
    }
}
