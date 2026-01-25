//
//  NativeTool.swift
//  pi
//
//  Enum and definitions for native macOS tools
//

import Foundation
import PiCore

/// Available native tools on macOS
enum NativeTool: String, CaseIterable, Sendable {
    case deviceInfo = "device_info"

    /// Tool definition for registration
    var definition: NativeToolDefinition {
        switch self {
        case .deviceInfo:
            return DeviceInfoTool.definition
        }
    }

    /// Create executor for this tool
    func makeExecutor() -> any NativeToolExecutable {
        switch self {
        case .deviceInfo:
            return DeviceInfoTool()
        }
    }

    /// Check if tool is available on this device
    var isAvailable: Bool {
        switch self {
        case .deviceInfo:
            return true
        }
    }

    /// All available tool definitions
    static var availableDefinitions: [NativeToolDefinition] {
        allCases.filter(\.isAvailable).map(\.definition)
    }

    /// Find a tool by name
    static func find(_ name: String) -> Self? {
        allCases.first { $0.rawValue == name }
    }
}

/// Protocol for native tool implementations (matches mobile signature)
protocol NativeToolExecutable: Sendable {
    static var definition: NativeToolDefinition { get }
    func execute(args: [String: AnyCodable], onCancel: @escaping @Sendable () -> Void) async throws -> [String: Any]
}

/// Errors from native tool execution
enum NativeToolError: Error, LocalizedError, Sendable {
    case unknownTool(String)
    case executionFailed(String)
    case invalidInput(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .unknownTool(let name):
            return "Unknown native tool: \(name)"
        case .executionFailed(let reason):
            return "Tool execution failed: \(reason)"
        case .invalidInput(let reason):
            return "Invalid input: \(reason)"
        case .cancelled:
            return "Tool execution was cancelled"
        }
    }
}
