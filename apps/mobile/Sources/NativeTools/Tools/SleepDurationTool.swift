//
//  SleepDurationTool.swift
//  Pi
//
//  Native tool for getting sleep duration and stages
//

import Foundation
@preconcurrency import HealthKit
import PiCore

/// Tool for retrieving sleep duration and stage breakdown for last night.
public struct SleepDurationTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_sleep_duration",
        description: "Get sleep duration and stages for last night",
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([String: Any]())
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
        // Check HealthKit availability
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NativeToolError.executionFailed("Health data is not available on this device.")
        }

        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            throw NativeToolError.executionFailed("Sleep analysis type not available.")
        }

        // Create health store for this request
        let healthStore = HKHealthStore()

        // Request authorization (will prompt if not determined, no-op if already decided)
        // Note: We can't check read authorization status - iOS hides this for privacy.
        // If denied, the query will simply return no results.
        do {
            try await healthStore.requestAuthorization(toShare: [], read: [sleepType])
        } catch {
            throw NativeToolError.executionFailed(
                "Failed to request health authorization: \(error.localizedDescription)"
            )
        }

        // Calculate "last night" date range: 6 PM yesterday to 12 PM today
        let calendar = Calendar.current
        let now = Date()
        let todayNoon = calendar.date(
            bySettingHour: 12,
            minute: 0,
            second: 0,
            of: now
        ) ?? now

        guard let yesterdayEvening = calendar.date(byAdding: .hour, value: -18, to: todayNoon) else {
            throw NativeToolError.executionFailed("Failed to calculate date range.")
        }

        // Query sleep samples
        let predicate = HKQuery.predicateForSamples(
            withStart: yesterdayEvening,
            end: todayNoon,
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
                    continuation.resume(throwing: NativeToolError.executionFailed(
                        "Failed to query sleep data: \(error.localizedDescription)"
                    ))
                    return
                }

                let categorySamples = (results as? [HKCategorySample]) ?? []
                continuation.resume(returning: categorySamples)
            }
            healthStore.execute(query)
        }

        // Filter to Apple Health sources to avoid duplicates from third-party apps
        let appleSamples = samples.filter { sample in
            let bundleId = sample.sourceRevision.source.bundleIdentifier
            return bundleId.hasPrefix("com.apple.health") || bundleId.hasPrefix("com.apple.watch")
        }

        // If no Apple samples, use all samples
        let relevantSamples = appleSamples.isEmpty ? samples : appleSamples

        guard !relevantSamples.isEmpty else {
            return [
                "totalDurationMinutes": NSNull(),
                "message": "No sleep data found for last night"
            ]
        }

        // Calculate duration by sleep stage
        var remMinutes: Double = 0
        var coreMinutes: Double = 0
        var deepMinutes: Double = 0
        var awakeCount = 0
        var bedtime: Date?
        var wakeTime: Date?

        for sample in relevantSamples {
            let duration = sample.endDate.timeIntervalSince(sample.startDate) / 60.0

            if let sleepValue = HKCategoryValueSleepAnalysis(rawValue: sample.value) {
                switch sleepValue {
                case .asleepREM:
                    remMinutes += duration
                    updateSleepTimes(sample: sample, bedtime: &bedtime, wakeTime: &wakeTime)
                case .asleepCore:
                    coreMinutes += duration
                    updateSleepTimes(sample: sample, bedtime: &bedtime, wakeTime: &wakeTime)
                case .asleepDeep:
                    deepMinutes += duration
                    updateSleepTimes(sample: sample, bedtime: &bedtime, wakeTime: &wakeTime)
                case .asleepUnspecified, .asleep:
                    // Add to core if not specified
                    coreMinutes += duration
                    updateSleepTimes(sample: sample, bedtime: &bedtime, wakeTime: &wakeTime)
                case .awake:
                    awakeCount += 1
                case .inBed:
                    // Track bed time but don't count as sleep
                    if bedtime == nil || sample.startDate < bedtime! {
                        bedtime = sample.startDate
                    }
                    if wakeTime == nil || sample.endDate > wakeTime! {
                        wakeTime = sample.endDate
                    }
                @unknown default:
                    break
                }
            }
        }

        let totalMinutes = remMinutes + coreMinutes + deepMinutes

        // Format response
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"

        var result: [String: Any] = [
            "date": dateFormatter.string(from: calendar.date(byAdding: .day, value: -1, to: now) ?? now),
            "totalDurationMinutes": Int(totalMinutes),
            "stages": [
                "remMinutes": Int(remMinutes),
                "coreMinutes": Int(coreMinutes),
                "deepMinutes": Int(deepMinutes)
            ],
            "awakenings": awakeCount
        ]

        if let bedtime {
            result["bedtime"] = timeFormatter.string(from: bedtime)
        }
        if let wakeTime {
            result["wakeTime"] = timeFormatter.string(from: wakeTime)
        }

        return result
    }

    private func updateSleepTimes(
        sample: HKCategorySample,
        bedtime: inout Date?,
        wakeTime: inout Date?
    ) {
        if bedtime == nil || sample.startDate < bedtime! {
            bedtime = sample.startDate
        }
        if wakeTime == nil || sample.endDate > wakeTime! {
            wakeTime = sample.endDate
        }
    }
}
