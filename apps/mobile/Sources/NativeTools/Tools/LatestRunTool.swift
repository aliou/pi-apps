//
//  LatestRunTool.swift
//  Pi
//
//  Native tool for getting the most recent running workout
//

import Foundation
@preconcurrency import HealthKit
import PiCore

/// Tool for retrieving the most recent running workout.
public struct LatestRunTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_latest_run",
        description: "Get the most recent running workout",
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([String: Any]())
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
        // Check HealthKit availability
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NativeToolError.executionFailed("Health data is not available on this device.")
        }

        let workoutType = HKObjectType.workoutType()
        guard let distanceType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) else {
            throw NativeToolError.executionFailed("Distance type not available.")
        }

        // Create health store for this request
        let healthStore = HKHealthStore()

        // Request authorization (will prompt if not determined, no-op if already decided)
        // Note: We can't check read authorization status - iOS hides this for privacy.
        // If denied, the query will simply return no results.
        do {
            try await healthStore.requestAuthorization(
                toShare: [],
                read: [workoutType, distanceType]
            )
        } catch {
            throw NativeToolError.executionFailed(
                "Failed to request health authorization: \(error.localizedDescription)"
            )
        }

        // Query for most recent running workout
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: runningPredicate,
                limit: 1,
                sortDescriptors: [sortDescriptor]
            ) { _, results, error in
                if let error {
                    continuation.resume(throwing: NativeToolError.executionFailed(
                        "Failed to query workouts: \(error.localizedDescription)"
                    ))
                    return
                }

                let workoutResults = (results as? [HKWorkout]) ?? []
                continuation.resume(returning: workoutResults)
            }
            healthStore.execute(query)
        }

        guard let workout = workouts.first else {
            return [
                "message": "No running workouts found"
            ]
        }

        // Extract workout data
        let durationMinutes = workout.duration / 60.0

        // Get distance
        var distanceKilometers: Double?
        if let distanceStats = workout.statistics(for: HKQuantityType(.distanceWalkingRunning)),
           let sumQuantity = distanceStats.sumQuantity() {
            distanceKilometers = sumQuantity.doubleValue(for: .meterUnit(with: .kilo))
        }

        // Calculate pace (minutes per kilometer)
        var paceMinutesPerKilometer: Double?
        if let distance = distanceKilometers, distance > 0 {
            paceMinutesPerKilometer = durationMinutes / distance
        }

        // Format response
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"

        var result: [String: Any] = [
            "date": dateFormatter.string(from: workout.startDate),
            "startTime": timeFormatter.string(from: workout.startDate),
            "durationMinutes": round(durationMinutes * 10) / 10
        ]

        if let distance = distanceKilometers {
            result["distanceKilometers"] = round(distance * 100) / 100
        }

        if let pace = paceMinutesPerKilometer {
            result["paceMinutesPerKilometer"] = round(pace * 100) / 100
        }

        return result
    }
}
