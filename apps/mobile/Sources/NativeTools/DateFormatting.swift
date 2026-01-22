//
//  DateFormatting.swift
//  Pi
//
//  Shared date formatting utilities for native tools
//

import Foundation

/// Shared date formatters for native tool responses.
/// All formatters use the device's current timezone and include day of week.
enum ToolDateFormatter {
    /// "Friday, 2026-01-17 at 14:30"
    static let dateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, yyyy-MM-dd 'at' HH:mm"
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    /// "Friday, 2026-01-17"
    static let dateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    /// "14:30"
    static let timeOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = TimeZone.current
        return formatter
    }()

    /// "yyyy-MM-dd" for parsing input dates
    static let inputDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter
    }()
}
