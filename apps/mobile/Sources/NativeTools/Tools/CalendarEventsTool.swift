//
//  CalendarEventsTool.swift
//  Pi
//
//  Native tool for getting calendar events
//

@preconcurrency import EventKit
import Foundation
import PiCore

/// Tool for retrieving calendar events for a specific date or date range.
public struct CalendarEventsTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_calendar_events",
        description: """
            Get calendar events for a specific date or date range. \
            Use 'date' for a single day, or 'startDate' and 'endDate' for a range. \
            Dates should be in YYYY-MM-DD format. \
            Defaults to today if no date is specified.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "date": [
                    "type": "string",
                    "description": "Single date in YYYY-MM-DD format (e.g., '2026-01-22')"
                ],
                "startDate": [
                    "type": "string",
                    "description": "Start of date range in YYYY-MM-DD format"
                ],
                "endDate": [
                    "type": "string",
                    "description": "End of date range in YYYY-MM-DD format"
                ]
            ])
            // No required fields - defaults to today
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
        let eventStore = EKEventStore()

        // Request permission
        try await requestCalendarAccess(eventStore: eventStore)

        // Parse date parameters
        let (startDate, endDate) = try parseDateParameters(args: args)

        // Query events
        let predicate = eventStore.predicateForEvents(
            withStart: startDate,
            end: endDate,
            calendars: nil
        )
        let events = eventStore.events(matching: predicate)

        // Format response
        let formattedEvents: [[String: Any]] = events.map { event in
            var eventDict: [String: Any] = [
                "title": event.title ?? "Untitled",
                "isAllDay": event.isAllDay
            ]

            if event.isAllDay {
                eventDict["date"] = ToolDateFormatter.dateOnly.string(from: event.startDate)
            } else {
                eventDict["startDateTime"] = ToolDateFormatter.dateTime.string(from: event.startDate)
                eventDict["endDateTime"] = ToolDateFormatter.dateTime.string(from: event.endDate)
            }

            if let location = event.location, !location.isEmpty {
                eventDict["location"] = location
            }

            if let notes = event.notes, !notes.isEmpty {
                eventDict["notes"] = String(notes.prefix(200))  // Truncate long notes
            }

            return eventDict
        }

        // Determine response format based on query type
        let calendar = Calendar.current
        let isSingleDay = calendar.isDate(startDate, inSameDayAs: endDate) ||
            calendar.date(byAdding: .day, value: 1, to: startDate) == endDate

        var result: [String: Any] = [
            "events": formattedEvents,
            "count": formattedEvents.count
        ]

        if isSingleDay {
            result["date"] = ToolDateFormatter.dateOnly.string(from: startDate)
        } else {
            result["startDate"] = ToolDateFormatter.dateOnly.string(from: startDate)
            result["endDate"] = ToolDateFormatter.dateOnly.string(
                from: calendar.date(byAdding: .day, value: -1, to: endDate) ?? endDate)
        }

        return result
    }

    // MARK: - Private Helpers

    private func requestCalendarAccess(eventStore: EKEventStore) async throws {
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
    }

    private func parseDateParameters(args: [String: AnyCodable]) throws -> (start: Date, end: Date) {
        let calendar = Calendar.current
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = TimeZone.current

        // Case 1: Single date provided
        if let dateString = args["date"]?.value as? String {
            guard let date = dateFormatter.date(from: dateString) else {
                throw NativeToolError.executionFailed(
                    "Invalid date format. Use YYYY-MM-DD (e.g., '2026-01-22')."
                )
            }
            let startOfDay = calendar.startOfDay(for: date)
            let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
            return (startOfDay, endOfDay)
        }

        // Case 2: Date range provided
        if let startString = args["startDate"]?.value as? String {
            guard let start = dateFormatter.date(from: startString) else {
                throw NativeToolError.executionFailed(
                    "Invalid startDate format. Use YYYY-MM-DD."
                )
            }

            let endDate: Date
            if let endString = args["endDate"]?.value as? String {
                guard let end = dateFormatter.date(from: endString) else {
                    throw NativeToolError.executionFailed(
                        "Invalid endDate format. Use YYYY-MM-DD."
                    )
                }
                // End of the end date (next day at midnight)
                endDate = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: end))!
            } else {
                // No end date - use start date only
                endDate = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: start))!
            }

            let startOfDay = calendar.startOfDay(for: start)

            // Validate range not too large (max 31 days)
            let daysDiff = calendar.dateComponents([.day], from: startOfDay, to: endDate).day ?? 0
            if daysDiff > 31 {
                throw NativeToolError.executionFailed(
                    "Date range too large. Maximum 31 days allowed."
                )
            }

            return (startOfDay, endDate)
        }

        // Case 3: No date provided - default to today
        let today = calendar.startOfDay(for: Date())
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        return (today, tomorrow)
    }
}
