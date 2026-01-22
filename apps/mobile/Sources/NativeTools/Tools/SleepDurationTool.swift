//
//  SleepDurationTool.swift
//  Pi
//
//  Native tool for getting sleep duration and stages
//

import Foundation
@preconcurrency import HealthKit
import PiCore

/// Tool for retrieving sleep duration and stage breakdown for a specific night or date range.
public struct SleepDurationTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_sleep_duration",
        description: """
            Get sleep duration and stages for a specific night or date range. \
            Use 'date' for a single night (sleep ending on that date), \
            or 'startDate' and 'endDate' for a range. \
            Dates should be in YYYY-MM-DD format. \
            Defaults to last night if no date is specified.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "date": [
                    "type": "string",
                    "description": "Date of sleep (YYYY-MM-DD) - returns sleep that ended on this date"
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
        ]
    )

    /// Check if sleep data access is available.
    /// Returns true if HealthKit is available on this device.
    /// Note: We can't check read authorization status - iOS hides this for privacy.
    /// The tool will attempt to read and return "no data" if access was denied.
    public static func isAvailable() -> Bool {
        // HealthKit is not available on iPad
        HKHealthStore.isHealthDataAvailable()
    }

    public init() {}

    public func execute(
        args: [String: AnyCodable],
        onCancel: @escaping @Sendable () -> Void
    ) async throws -> [String: Any] {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NativeToolError.executionFailed("Health data is not available on this device.")
        }

        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            throw NativeToolError.executionFailed("Sleep analysis type not available.")
        }

        let healthStore = HKHealthStore()

        // Request authorization
        try await healthStore.requestAuthorization(toShare: [], read: [sleepType])

        // Parse date parameters
        let (startDate, endDate, isRange) = try parseDateParameters(args: args)

        // Query sleep samples
        let predicate = HKQuery.predicateForSamples(
            withStart: startDate,
            end: endDate,
            options: .strictStartDate
        )

        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: sleepType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [sortDescriptor]
            ) { _, results, error in
                if let error {
                    continuation.resume(
                        throwing: NativeToolError.executionFailed(
                            "Failed to query sleep data: \(error.localizedDescription)"
                        ))
                    return
                }
                continuation.resume(returning: (results as? [HKCategorySample]) ?? [])
            }
            healthStore.execute(query)
        }

        // Filter to Apple Health sources
        let appleSamples = samples.filter { sample in
            let bundleId = sample.sourceRevision.source.bundleIdentifier
            return bundleId.hasPrefix("com.apple.health") || bundleId.hasPrefix("com.apple.watch")
        }
        let relevantSamples = appleSamples.isEmpty ? samples : appleSamples

        if isRange {
            return processSleepRange(samples: relevantSamples, startDate: startDate, endDate: endDate)
        }
        return processSingleNight(samples: relevantSamples, date: endDate)
    }

    // MARK: - Private Helpers

    private func parseDateParameters(args: [String: AnyCodable]) throws -> (
        start: Date, end: Date, isRange: Bool
    ) {
        let calendar = Calendar.current
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = TimeZone.current

        // Case 1: Single date - sleep ending on that date (6 PM previous day to 12 PM this day)
        if let dateString = args["date"]?.value as? String {
            guard let date = dateFormatter.date(from: dateString) else {
                throw NativeToolError.executionFailed("Invalid date format. Use YYYY-MM-DD.")
            }
            let (start, end) = sleepWindowForDate(date, calendar: calendar)
            return (start, end, false)
        }

        // Case 2: Date range
        if let startString = args["startDate"]?.value as? String {
            guard let start = dateFormatter.date(from: startString) else {
                throw NativeToolError.executionFailed("Invalid startDate format. Use YYYY-MM-DD.")
            }

            let endDate: Date
            if let endString = args["endDate"]?.value as? String {
                guard let end = dateFormatter.date(from: endString) else {
                    throw NativeToolError.executionFailed("Invalid endDate format. Use YYYY-MM-DD.")
                }
                endDate = end
            } else {
                endDate = start
            }

            // For range, use 6 PM on start date to 12 PM on day after end date
            let (rangeStart, _) = sleepWindowForDate(start, calendar: calendar)
            let (_, rangeEnd) = sleepWindowForDate(
                calendar.date(byAdding: .day, value: 1, to: endDate)!, calendar: calendar)

            // Validate range
            let daysDiff = calendar.dateComponents([.day], from: rangeStart, to: rangeEnd).day ?? 0
            if daysDiff > 14 {
                throw NativeToolError.executionFailed(
                    "Date range too large. Maximum 14 days allowed for sleep data.")
            }

            return (rangeStart, rangeEnd, true)
        }

        // Case 3: Default to last night
        let today = Date()
        let (start, end) = sleepWindowForDate(today, calendar: calendar)
        return (start, end, false)
    }

    private func sleepWindowForDate(_ date: Date, calendar: Calendar) -> (start: Date, end: Date) {
        // Sleep ending on `date`: 6 PM previous day to 12 PM this day
        let noon = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: date)!
        let previousEvening = calendar.date(byAdding: .hour, value: -18, to: noon)!
        return (previousEvening, noon)
    }

    private func processSingleNight(samples: [HKCategorySample], date: Date) -> [String: Any] {
        guard !samples.isEmpty else {
            return [
                "date": ToolDateFormatter.dateOnly.string(from: date),
                "totalDurationMinutes": NSNull(),
                "message": "No sleep data found"
            ]
        }

        var stats = SleepStats()
        for sample in samples {
            stats.process(sample: sample)
        }

        var result: [String: Any] = [
            "date": ToolDateFormatter.dateOnly.string(
                from: Calendar.current.date(byAdding: .day, value: -1, to: date) ?? date),
            "totalDurationMinutes": Int(stats.totalMinutes),
            "stages": [
                "remMinutes": Int(stats.remMinutes),
                "coreMinutes": Int(stats.coreMinutes),
                "deepMinutes": Int(stats.deepMinutes)
            ],
            "awakenings": stats.awakeCount
        ]

        if let bedtime = stats.bedtime {
            result["bedtime"] = ToolDateFormatter.timeOnly.string(from: bedtime)
        }
        if let wakeTime = stats.wakeTime {
            result["wakeTime"] = ToolDateFormatter.timeOnly.string(from: wakeTime)
        }

        return result
    }

    private func processSleepRange(samples: [HKCategorySample], startDate: Date, endDate: Date)
        -> [String: Any]
    {
        let calendar = Calendar.current

        // Group samples by night (date they ended on)
        var nightlyData: [String: SleepStats] = [:]

        for sample in samples {
            // Determine which "night" this sample belongs to (based on end date)
            let noonOfEndDay = calendar.date(
                bySettingHour: 12, minute: 0, second: 0, of: sample.endDate)!
            let nightDate: Date
            if sample.endDate <= noonOfEndDay {
                nightDate = sample.endDate
            } else {
                nightDate = calendar.date(byAdding: .day, value: 1, to: sample.endDate)!
            }

            let nightKey = ToolDateFormatter.dateOnly.string(from: nightDate)
            var stats = nightlyData[nightKey] ?? SleepStats()
            stats.process(sample: sample)
            nightlyData[nightKey] = stats
        }

        // Format as array of nightly summaries
        let nights: [[String: Any]] = nightlyData.map { date, stats in
            [
                "date": date,
                "totalDurationMinutes": Int(stats.totalMinutes),
                "remMinutes": Int(stats.remMinutes),
                "deepMinutes": Int(stats.deepMinutes),
                "coreMinutes": Int(stats.coreMinutes),
                "awakenings": stats.awakeCount
            ]
        }.sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }

        // Calculate averages
        let totalNights = nights.count
        let avgDuration =
            totalNights > 0
            ? nights.compactMap { $0["totalDurationMinutes"] as? Int }.reduce(0, +) / totalNights
            : 0

        return [
            "startDate": ToolDateFormatter.dateOnly.string(from: startDate),
            "endDate": ToolDateFormatter.dateOnly.string(
                from: calendar.date(byAdding: .day, value: -1, to: endDate) ?? endDate),
            "nights": nights,
            "summary": [
                "totalNights": totalNights,
                "averageDurationMinutes": avgDuration
            ]
        ]
    }
}

// MARK: - Sleep Stats Helper

private struct SleepStats {
    var remMinutes: Double = 0
    var coreMinutes: Double = 0
    var deepMinutes: Double = 0
    var awakeCount: Int = 0
    var bedtime: Date?
    var wakeTime: Date?

    var totalMinutes: Double {
        remMinutes + coreMinutes + deepMinutes
    }

    mutating func process(sample: HKCategorySample) {
        let duration = sample.endDate.timeIntervalSince(sample.startDate) / 60.0

        guard let sleepValue = HKCategoryValueSleepAnalysis(rawValue: sample.value) else { return }

        switch sleepValue {
        case .asleepREM:
            remMinutes += duration
            updateTimes(sample: sample)
        case .asleepCore:
            coreMinutes += duration
            updateTimes(sample: sample)
        case .asleepDeep:
            deepMinutes += duration
            updateTimes(sample: sample)
        case .asleepUnspecified, .asleep:
            coreMinutes += duration
            updateTimes(sample: sample)
        case .awake:
            awakeCount += 1
        case .inBed:
            updateTimes(sample: sample)
        @unknown default:
            break
        }
    }

    private mutating func updateTimes(sample: HKCategorySample) {
        if bedtime == nil || sample.startDate < bedtime! {
            bedtime = sample.startDate
        }
        if wakeTime == nil || sample.endDate > wakeTime! {
            wakeTime = sample.endDate
        }
    }
}
