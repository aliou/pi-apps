//
//  GetRemindersTool.swift
//  Pi
//
//  Native tool for getting reminders from EventKit
//

@preconcurrency import EventKit
import Foundation
import PiCore

/// Tool for retrieving reminders from a specific list or all lists.
public struct GetRemindersTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_reminders",
        description: """
            Get reminders from a specific list or all lists. \
            Can filter by completion status. \
            Returns reminder title, due date, priority, and completion status.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "listName": [
                    "type": "string",
                    "description": "Name of reminder list to fetch from (optional, defaults to all lists)"
                ],
                "includeCompleted": [
                    "type": "boolean",
                    "description": "Include completed reminders (default: false)"
                ],
                "dueBefore": [
                    "type": "string",
                    "description": "Only show reminders due before this date (YYYY-MM-DD)"
                ],
                "dueAfter": [
                    "type": "string",
                    "description": "Only show reminders due after this date (YYYY-MM-DD)"
                ]
            ])
        ]
    )

    /// Check if reminders access is available (not denied).
    public static func isAvailable() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .reminder)
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
        try await requestRemindersAccess(eventStore: eventStore)

        // Get calendars (reminder lists)
        let allCalendars = eventStore.calendars(for: .reminder)

        // Filter to specific list if requested
        let listName = args["listName"]?.value as? String
        let calendars: [EKCalendar]
        if let listName {
            calendars = allCalendars.filter {
                $0.title.lowercased() == listName.lowercased()
            }
            if calendars.isEmpty {
                // Return available lists to help user
                let availableLists = allCalendars.map { $0.title }
                return [
                    "error": "List '\(listName)' not found",
                    "availableLists": availableLists
                ]
            }
        } else {
            calendars = allCalendars
        }

        // Parse filter options
        let includeCompleted = args["includeCompleted"]?.value as? Bool ?? false
        let (dueAfter, dueBefore) = parseDueDateFilters(args: args)

        // Build predicate
        let predicate: NSPredicate
        if includeCompleted {
            predicate = eventStore.predicateForReminders(in: calendars)
        } else {
            predicate = eventStore.predicateForIncompleteReminders(
                withDueDateStarting: dueAfter,
                ending: dueBefore,
                calendars: calendars
            )
        }

        // Fetch reminders
        let reminders = try await fetchReminders(eventStore: eventStore, predicate: predicate)

        // Filter completed if needed (predicateForReminders returns all)
        let filteredReminders: [EKReminder]
        if includeCompleted {
            filteredReminders = reminders
        } else {
            filteredReminders = reminders.filter { !$0.isCompleted }
        }

        // Format results
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"

        let formattedReminders: [[String: Any]] = filteredReminders.compactMap { reminder in
            guard let title = reminder.title, !title.isEmpty else { return nil }

            var result: [String: Any] = [
                "title": title,
                "isCompleted": reminder.isCompleted,
                "list": reminder.calendar.title
            ]

            // Due date
            if let dueDateComponents = reminder.dueDateComponents,
               let dueDate = Calendar.current.date(from: dueDateComponents) {
                result["dueDate"] = dateFormatter.string(from: dueDate)
                if dueDateComponents.hour != nil {
                    result["dueTime"] = timeFormatter.string(from: dueDate)
                }
            }

            // Priority (0 = none, 1-4 = high, 5 = medium, 6-9 = low)
            if reminder.priority > 0 {
                let priorityName: String
                switch reminder.priority {
                case 1...4: priorityName = "high"
                case 5: priorityName = "medium"
                default: priorityName = "low"
                }
                result["priority"] = priorityName
            }

            // Notes (truncated)
            if let notes = reminder.notes, !notes.isEmpty {
                result["notes"] = String(notes.prefix(100))
            }

            return result
        }

        // Build response
        var response: [String: Any] = [
            "reminders": formattedReminders,
            "count": formattedReminders.count
        ]

        if let listName {
            response["list"] = listName
        } else {
            response["lists"] = calendars.map { $0.title }
        }

        return response
    }

    // MARK: - Private Helpers

    private func requestRemindersAccess(eventStore: EKEventStore) async throws {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        switch status {
        case .notDetermined:
            let granted = try await eventStore.requestFullAccessToReminders()
            if !granted {
                throw NativeToolError.executionFailed(
                    "Reminders access denied. Please enable in Settings > Privacy > Reminders."
                )
            }
        case .denied, .restricted, .writeOnly:
            throw NativeToolError.executionFailed(
                "Reminders access denied. Please enable in Settings > Privacy > Reminders."
            )
        case .fullAccess, .authorized:
            break
        @unknown default:
            throw NativeToolError.executionFailed("Unknown reminders authorization status.")
        }
    }

    private func parseDueDateFilters(args: [String: AnyCodable]) -> (after: Date?, before: Date?) {
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let dueAfter: Date?
        if let afterString = args["dueAfter"]?.value as? String {
            dueAfter = dateFormatter.date(from: afterString)
        } else {
            dueAfter = nil
        }

        let dueBefore: Date?
        if let beforeString = args["dueBefore"]?.value as? String {
            if let date = dateFormatter.date(from: beforeString) {
                // End of day
                dueBefore = Calendar.current.date(byAdding: .day, value: 1, to: date)
            } else {
                dueBefore = nil
            }
        } else {
            dueBefore = nil
        }

        return (dueAfter, dueBefore)
    }

    private func fetchReminders(eventStore: EKEventStore, predicate: NSPredicate) async throws -> [EKReminder] {
        try await withCheckedThrowingContinuation { continuation in
            eventStore.fetchReminders(matching: predicate) { reminders in
                // Transfer value across isolation boundary
                nonisolated(unsafe) let result = reminders ?? []
                continuation.resume(returning: result)
            }
        }
    }
}
