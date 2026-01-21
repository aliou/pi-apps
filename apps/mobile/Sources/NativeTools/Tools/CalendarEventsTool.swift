//
//  CalendarEventsTool.swift
//  Pi
//
//  Native tool for getting calendar events
//

@preconcurrency import EventKit
import Foundation
import PiCore

/// Tool for retrieving calendar events for today or tomorrow.
public struct CalendarEventsTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_calendar_events",
        description: "Get calendar events for today or tomorrow",
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "day": [
                    "type": "string",
                    "enum": ["today", "tomorrow"],
                    "description": "Which day to fetch events for"
                ]
            ]),
            "required": AnyCodable(["day"])
        ]
    )

    /// Check if calendar access is available (not denied).
    /// Returns true if authorized or not yet determined.
    public static func isAvailable() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .notDetermined, .fullAccess, .authorized:
            return true
        case .denied, .restricted, .writeOnly:
            return false
        @unknown default:
            return false
        }
    }

    public init() {}

    public func execute(
        args: [String: AnyCodable],
        onCancel: @escaping @Sendable () -> Void
    ) async throws -> [String: Any] {
        // Validate arguments
        guard let day = args["day"]?.value as? String,
              ["today", "tomorrow"].contains(day) else {
            throw NativeToolError.executionFailed("Invalid day parameter. Must be 'today' or 'tomorrow'.")
        }

        // Create event store for this request
        let eventStore = EKEventStore()

        // Request permission if needed
        let status = EKEventStore.authorizationStatus(for: .event)
        switch status {
        case .notDetermined:
            let granted = try await eventStore.requestFullAccessToEvents()
            if !granted {
                throw NativeToolError.executionFailed(
                    "Calendar access denied. Please enable in Settings > Privacy > Calendars."
                )
            }
        case .denied, .restricted, .writeOnly:
            throw NativeToolError.executionFailed(
                "Calendar access denied. Please enable in Settings > Privacy > Calendars."
            )
        case .fullAccess, .authorized:
            break
        @unknown default:
            throw NativeToolError.executionFailed("Unknown calendar authorization status.")
        }

        // Calculate date range
        let calendar = Calendar.current
        let now = Date()

        let targetDate: Date
        if day == "today" {
            targetDate = now
        } else {
            targetDate = calendar.date(byAdding: .day, value: 1, to: now) ?? now
        }

        let startOfDay = calendar.startOfDay(for: targetDate)
        guard let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay) else {
            throw NativeToolError.executionFailed("Failed to calculate date range.")
        }

        // Query events
        let predicate = eventStore.predicateForEvents(
            withStart: startOfDay,
            end: endOfDay,
            calendars: nil
        )
        let events = eventStore.events(matching: predicate)

        // Format response
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"

        let formattedEvents: [[String: Any]] = events.map { event in
            var eventDict: [String: Any] = [
                "title": event.title ?? "Untitled",
                "isAllDay": event.isAllDay
            ]

            if !event.isAllDay {
                eventDict["startTime"] = timeFormatter.string(from: event.startDate)
                eventDict["endTime"] = timeFormatter.string(from: event.endDate)
            }

            if let location = event.location, !location.isEmpty {
                eventDict["location"] = location
            }

            return eventDict
        }

        return [
            "day": day,
            "date": dateFormatter.string(from: targetDate),
            "events": formattedEvents
        ]
    }
}
