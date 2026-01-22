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
    case getCalendarEvents = "get_calendar_events"
    case getSleepDuration = "get_sleep_duration"
    case getWorkouts = "get_workouts"
    case displayChart = "display_chart"
    case getReminders = "get_reminders"
    case createReminder = "create_reminder"
    case getCurrentLocation = "get_current_location"

    /// Get all tool definitions for hello handshake (deprecated, use availableDefinitions).
    public static var allDefinitions: [NativeToolDefinition] {
        allCases.map { $0.definition }
    }

    /// Get tool definitions only for tools that are available.
    /// Excludes tools where permission has been denied.
    public static var availableDefinitions: [NativeToolDefinition] {
        allCases
            .filter { $0.isAvailable }
            .map { $0.definition }
    }

    /// Check if this tool is available (permission not denied).
    public var isAvailable: Bool {
        switch self {
        case .getDeviceInfo:
            return true  // No permission needed
        case .getCalendarEvents:
            return CalendarEventsTool.isAvailable()
        case .getSleepDuration:
            return SleepDurationTool.isAvailable()
        case .getWorkouts:
            return WorkoutsTool.isAvailable()
        case .displayChart:
            return DisplayChartTool.isAvailable()
        case .getReminders:
            return GetRemindersTool.isAvailable()
        case .createReminder:
            return CreateReminderTool.isAvailable()
        case .getCurrentLocation:
            return GetLocationTool.isAvailable()
        }
    }

    /// Get the definition for this tool.
    public var definition: NativeToolDefinition {
        switch self {
        case .getDeviceInfo:
            return DeviceInfoTool.definition
        case .getCalendarEvents:
            return CalendarEventsTool.definition
        case .getSleepDuration:
            return SleepDurationTool.definition
        case .getWorkouts:
            return WorkoutsTool.definition
        case .displayChart:
            return DisplayChartTool.definition
        case .getReminders:
            return GetRemindersTool.definition
        case .createReminder:
            return CreateReminderTool.definition
        case .getCurrentLocation:
            return GetLocationTool.definition
        }
    }

    /// Create an executor instance for this tool.
    public func makeExecutor() -> any NativeToolExecutable {
        switch self {
        case .getDeviceInfo:
            return DeviceInfoTool()
        case .getCalendarEvents:
            return CalendarEventsTool()
        case .getSleepDuration:
            return SleepDurationTool()
        case .getWorkouts:
            return WorkoutsTool()
        case .displayChart:
            return DisplayChartTool()
        case .getReminders:
            return GetRemindersTool()
        case .createReminder:
            return CreateReminderTool()
        case .getCurrentLocation:
            return GetLocationTool()
        }
    }

    /// Find a tool by name.
    public static func find(_ name: String) -> Self? {
        Self(rawValue: name)
    }
}
