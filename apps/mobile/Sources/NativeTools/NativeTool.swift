//
//  NativeTool.swift
//  Pi
//
//  Protocol and registry for native tools
//

import Foundation
import PiCore

/// Protocol that all native tools must implement.
public protocol NativeToolExecutable: Sendable {
    /// The tool definition to send in hello handshake.
    static var definition: NativeToolDefinition { get }

    /// Execute the tool with given arguments.
    /// Each tool is responsible for handling its own permissions.
    /// - Parameters:
    ///   - args: Arguments from the LLM
    ///   - onCancel: Called if the tool execution should be cancelled
    /// - Returns: Dictionary result to send back to server
    func execute(args: [String: AnyCodable], onCancel: @escaping @Sendable () -> Void) async throws -> [String: Any]
}

/// Registry of all available native tools.
public enum NativeTool: String, CaseIterable, Sendable {
    case getDeviceInfo = "get_device_info"
    // Add more tools here:
    // case addCalendarEvent = "add_calendar_event"
    // case takePhoto = "take_photo"

    /// Get all tool definitions for hello handshake.
    public static var allDefinitions: [NativeToolDefinition] {
        allCases.map { $0.definition }
    }

    /// Get the definition for this tool.
    public var definition: NativeToolDefinition {
        switch self {
        case .getDeviceInfo:
            return DeviceInfoTool.definition
        }
    }

    /// Create an executor instance for this tool.
    public func makeExecutor() -> any NativeToolExecutable {
        switch self {
        case .getDeviceInfo:
            return DeviceInfoTool()
        }
    }

    /// Find a tool by name.
    public static func find(_ name: String) -> Self? {
        Self(rawValue: name)
    }
}
