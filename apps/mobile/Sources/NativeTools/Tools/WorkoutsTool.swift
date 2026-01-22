//
//  WorkoutsTool.swift
//  Pi
//
//  Native tool for getting workouts from HealthKit
//

import Foundation
@preconcurrency import HealthKit
import PiCore

/// Tool for retrieving workouts with optional type and date filtering.
public struct WorkoutsTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_workouts",
        description: """
            Get workouts from HealthKit. Can filter by workout type and date range. \
            Supported types: running, walking, cycling, swimming, hiking, yoga, \
            strength_training, hiit, dance, elliptical, rowing, stair_climbing. \
            Use 'all' for all workout types. \
            Dates should be in YYYY-MM-DD format. \
            Defaults to last 7 days of all workouts.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "workoutType": [
                    "type": "string",
                    "description": "Type of workout (e.g., 'running', 'cycling', 'all')"
                ],
                "date": [
                    "type": "string",
                    "description": "Single date in YYYY-MM-DD format"
                ],
                "startDate": [
                    "type": "string",
                    "description": "Start of date range in YYYY-MM-DD format"
                ],
                "endDate": [
                    "type": "string",
                    "description": "End of date range in YYYY-MM-DD format"
                ],
                "limit": [
                    "type": "integer",
                    "description": "Maximum number of workouts to return (default: 20, max: 50)"
                ]
            ])
        ]
    )

    /// Check if workout data access is available.
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

        let workoutType = HKObjectType.workoutType()
        let distanceType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!

        let healthStore = HKHealthStore()

        // Request authorization
        try await healthStore.requestAuthorization(
            toShare: [],
            read: [workoutType, distanceType]
        )

        // Parse parameters
        let activityType = parseWorkoutType(args: args)
        let (startDate, endDate) = try parseDateParameters(args: args)
        let limit = parseLimit(args: args)

        // Build predicate
        var predicates: [NSPredicate] = []

        // Date predicate
        predicates.append(
            HKQuery.predicateForSamples(
                withStart: startDate,
                end: endDate,
                options: .strictStartDate
            ))

        // Workout type predicate (if not "all")
        if let activity = activityType {
            predicates.append(HKQuery.predicateForWorkouts(with: activity))
        }

        let compoundPredicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        // Query workouts
        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: compoundPredicate,
                limit: limit,
                sortDescriptors: [sortDescriptor]
            ) { _, results, error in
                if let error {
                    continuation.resume(
                        throwing: NativeToolError.executionFailed(
                            "Failed to query workouts: \(error.localizedDescription)"
                        ))
                    return
                }
                continuation.resume(returning: (results as? [HKWorkout]) ?? [])
            }
            healthStore.execute(query)
        }

        guard !workouts.isEmpty else {
            return [
                "workouts": [],
                "count": 0,
                "message": "No workouts found"
            ]
        }

        // Format results
        let formattedWorkouts: [[String: Any]] = workouts.map { workout in
            var result: [String: Any] = [
                "type": Self.workoutTypeName(workout.workoutActivityType),
                "dateTime": ToolDateFormatter.dateTime.string(from: workout.startDate),
                "durationMinutes": round(workout.duration / 60.0 * 10) / 10
            ]

            // Distance (if applicable)
            if let distanceStats = workout.statistics(for: HKQuantityType(.distanceWalkingRunning)),
                let distance = distanceStats.sumQuantity()
            {
                result["distanceKilometers"] =
                    round(distance.doubleValue(for: .meterUnit(with: .kilo)) * 100) / 100
            }

            // Calories
            if let calories = workout.totalEnergyBurned {
                result["caloriesBurned"] = Int(calories.doubleValue(for: .kilocalorie()))
            }

            return result
        }

        return [
            "workouts": formattedWorkouts,
            "count": formattedWorkouts.count,
            "startDate": ToolDateFormatter.dateTime.string(from: startDate),
            "endDate": ToolDateFormatter.dateTime.string(from: endDate)
        ]
    }

    // MARK: - Private Helpers

    private func parseWorkoutType(args: [String: AnyCodable]) -> HKWorkoutActivityType? {
        guard let typeString = args["workoutType"]?.value as? String else {
            return nil  // All types
        }

        let type = typeString.lowercased()
        if type == "all" { return nil }

        let mapping: [String: HKWorkoutActivityType] = [
            "running": .running,
            "run": .running,
            "walking": .walking,
            "walk": .walking,
            "cycling": .cycling,
            "biking": .cycling,
            "bike": .cycling,
            "swimming": .swimming,
            "swim": .swimming,
            "hiking": .hiking,
            "hike": .hiking,
            "yoga": .yoga,
            "strength_training": .traditionalStrengthTraining,
            "strength": .traditionalStrengthTraining,
            "weights": .traditionalStrengthTraining,
            "hiit": .highIntensityIntervalTraining,
            "dance": .dance,
            "dancing": .dance,
            "elliptical": .elliptical,
            "rowing": .rowing,
            "row": .rowing,
            "stair_climbing": .stairClimbing,
            "stairs": .stairClimbing
        ]

        return mapping[type]
    }

    private static func workoutTypeName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "running"
        case .walking: return "walking"
        case .cycling: return "cycling"
        case .swimming: return "swimming"
        case .hiking: return "hiking"
        case .yoga: return "yoga"
        case .traditionalStrengthTraining: return "strength_training"
        case .highIntensityIntervalTraining: return "hiit"
        case .dance: return "dance"
        case .elliptical: return "elliptical"
        case .rowing: return "rowing"
        case .stairClimbing: return "stair_climbing"
        default: return "other"
        }
    }

    private func parseDateParameters(args: [String: AnyCodable]) throws -> (start: Date, end: Date) {
        let calendar = Calendar.current
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        dateFormatter.timeZone = TimeZone.current

        // Single date
        if let dateString = args["date"]?.value as? String {
            guard let date = dateFormatter.date(from: dateString) else {
                throw NativeToolError.executionFailed("Invalid date format. Use YYYY-MM-DD.")
            }
            let startOfDay = calendar.startOfDay(for: date)
            let endOfDay = calendar.date(byAdding: .day, value: 1, to: startOfDay)!
            return (startOfDay, endOfDay)
        }

        // Date range
        if let startString = args["startDate"]?.value as? String {
            guard let start = dateFormatter.date(from: startString) else {
                throw NativeToolError.executionFailed("Invalid startDate format. Use YYYY-MM-DD.")
            }

            let endDate: Date
            if let endString = args["endDate"]?.value as? String {
                guard let end = dateFormatter.date(from: endString) else {
                    throw NativeToolError.executionFailed("Invalid endDate format. Use YYYY-MM-DD.")
                }
                endDate = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: end))!
            } else {
                endDate = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: start))!
            }

            return (calendar.startOfDay(for: start), endDate)
        }

        // Default: last 7 days
        let now = Date()
        let endOfToday = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))!
        let sevenDaysAgo = calendar.date(byAdding: .day, value: -7, to: calendar.startOfDay(for: now))!
        return (sevenDaysAgo, endOfToday)
    }

    private func parseLimit(args: [String: AnyCodable]) -> Int {
        if let limit = args["limit"]?.value as? Int {
            return min(max(limit, 1), 50)  // Clamp between 1 and 50
        }
        return 20  // Default
    }
}
