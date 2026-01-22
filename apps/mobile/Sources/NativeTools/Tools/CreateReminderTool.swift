//
//  CreateReminderTool.swift
//  Pi
//
//  Native tool for creating reminders via EventKit
//

@preconcurrency import EventKit
import Foundation
import PiCore

/// Tool for creating new reminders.
public struct CreateReminderTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "create_reminder",
        description: """
            Create a new reminder. Requires a title. \
            Can optionally specify list, due date/time, priority, and notes. \
            If no list is specified, uses the default reminders list.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "title": [
                    "type": "string",
                    "description": "Title of the reminder (required)"
                ],
                "listName": [
                    "type": "string",
                    "description": "Name of reminder list (optional, uses default if not specified)"
                ],
                "dueDate": [
                    "type": "string",
                    "description": "Due date in YYYY-MM-DD format (optional)"
                ],
                "dueTime": [
                    "type": "string",
                    "description": "Due time in HH:mm format, 24-hour (optional, requires dueDate)"
                ],
                "priority": [
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": "Priority level (optional)"
                ],
                "notes": [
                    "type": "string",
                    "description": "Additional notes (optional)"
                ]
            ]),
            "required": AnyCodable(["title"])
        ]
    )

    /// Check if reminders access is available (not denied).
    public static func isAvailable() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        switch status {
        case .notDetermined, .fullAccess, .authorized:
            return true
        case .denied, .restricted, .writeOnly:
            // writeOnly would actually allow creation, but for simplicity treat as unavailable
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
        // Validate required fields
        guard let title = args["title"]?.value as? String, !title.isEmpty else {
            throw NativeToolError.executionFailed("Title is required.")
        }

        let eventStore = EKEventStore()

        // Request permission
        try await requestRemindersAccess(eventStore: eventStore)

        // Find or use default calendar
        let calendar: EKCalendar
        if let listName = args["listName"]?.value as? String {
            let allCalendars = eventStore.calendars(for: .reminder)
            guard let found = allCalendars.first(where: {
                $0.title.lowercased() == listName.lowercased()
            }) else {
                let availableLists = allCalendars.map { $0.title }
                throw NativeToolError.executionFailed(
                    "List '\(listName)' not found. Available lists: \(availableLists.joined(separator: ", "))"
                )
            }
            calendar = found
        } else {
            guard let defaultCalendar = eventStore.defaultCalendarForNewReminders() else {
                throw NativeToolError.executionFailed("No default reminders list available.")
            }
            calendar = defaultCalendar
        }

        // Create reminder
        let reminder = EKReminder(eventStore: eventStore)
        reminder.title = title
        reminder.calendar = calendar

        // Set due date if provided
        if let dueDateString = args["dueDate"]?.value as? String {
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"

            guard let dueDate = dateFormatter.date(from: dueDateString) else {
                throw NativeToolError.executionFailed("Invalid dueDate format. Use YYYY-MM-DD.")
            }

            var components = Calendar.current.dateComponents(
                [.year, .month, .day],
                from: dueDate
            )

            // Add time if provided
            if let dueTimeString = args["dueTime"]?.value as? String {
                let timeFormatter = DateFormatter()
                timeFormatter.dateFormat = "HH:mm"

                if let time = timeFormatter.date(from: dueTimeString) {
                    let timeComponents = Calendar.current.dateComponents([.hour, .minute], from: time)
                    components.hour = timeComponents.hour
                    components.minute = timeComponents.minute
                }
            }

            reminder.dueDateComponents = components

            // Add alarm at due time
            if let alarmDate = Calendar.current.date(from: components) {
                reminder.addAlarm(EKAlarm(absoluteDate: alarmDate))
            }
        }

        // Set priority
        if let priorityString = args["priority"]?.value as? String {
            switch priorityString.lowercased() {
            case "high": reminder.priority = 1
            case "medium": reminder.priority = 5
            case "low": reminder.priority = 9
            default: break
            }
        }

        // Set notes
        if let notes = args["notes"]?.value as? String {
            reminder.notes = notes
        }

        // Save reminder
        do {
            try eventStore.save(reminder, commit: true)
        } catch {
            throw NativeToolError.executionFailed("Failed to save reminder: \(error.localizedDescription)")
        }

        // Build response
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd HH:mm"

        var response: [String: Any] = [
            "success": true,
            "title": title,
            "list": calendar.title
        ]

        if let components = reminder.dueDateComponents,
           let dueDate = Calendar.current.date(from: components) {
            response["dueDate"] = dateFormatter.string(from: dueDate)
        }

        if let priorityString = args["priority"]?.value as? String {
            response["priority"] = priorityString
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
        case .denied, .restricted:
            throw NativeToolError.executionFailed(
                "Reminders access denied. Please enable in Settings > Privacy > Reminders."
            )
        case .fullAccess, .authorized, .writeOnly:
            break
        @unknown default:
            throw NativeToolError.executionFailed("Unknown reminders authorization status.")
        }
    }
}
