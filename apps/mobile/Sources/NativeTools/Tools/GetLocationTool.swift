//
//  GetLocationTool.swift
//  Pi
//
//  Native tool for getting user's current location
//

import CoreLocation
import Foundation
import PiCore

/// Tool for getting the user's current location.
/// iOS only - not available on macOS.
public struct GetLocationTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_current_location",
        description: """
            Get the user's current geographic location (latitude, longitude). \
            Also returns accuracy, altitude if available, and reverse-geocoded address. \
            Requires user permission for location access.
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([
                "includeAddress": [
                    "type": "boolean",
                    "description": "Include reverse-geocoded address (default: true)"
                ]
            ])
        ]
    )

    /// Check if location services are available and not denied.
    public static func isAvailable() -> Bool {
        #if os(iOS)
        guard CLLocationManager.locationServicesEnabled() else {
            return false
        }

        // TODO: This can cause UI unresponsiveness on main thread.
        // Should refactor to check status asynchronously or defer to execute().
        let status = CLLocationManager().authorizationStatus
        switch status {
        case .notDetermined, .authorizedWhenInUse, .authorizedAlways:
            return true
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
        #else
        // Not available on macOS in this implementation
        return false
        #endif
    }

    public init() {}

    public func execute(
        args: [String: AnyCodable],
        onCancel: @escaping @Sendable () -> Void
    ) async throws -> [String: Any] {
        #if os(iOS)
        let includeAddress = args["includeAddress"]?.value as? Bool ?? true

        // Create location manager
        let locationFetcher = await LocationFetcher()

        // Request location
        let location = try await locationFetcher.getCurrentLocation()
        let isReducedAccuracy = await locationFetcher.isReducedAccuracy

        // Build base response
        var response: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "accuracyLevel": isReducedAccuracy ? "reduced" : "full",
            "timestamp": ISO8601DateFormatter().string(from: location.timestamp)
        ]

        // Note if reduced accuracy
        if isReducedAccuracy {
            response["note"] = "Location is approximate. User granted reduced accuracy permission."
        }

        // Add altitude if valid
        if location.verticalAccuracy >= 0 {
            response["altitude"] = location.altitude
            response["altitudeAccuracy"] = location.verticalAccuracy
        }

        // Add speed if valid
        if location.speed >= 0 {
            response["speed"] = location.speed  // meters per second
        }

        // Add heading if valid
        if location.course >= 0 {
            response["heading"] = location.course  // degrees from north
        }

        // Reverse geocode if requested
        if includeAddress {
            if let address = try? await reverseGeocode(location: location) {
                response["address"] = address
            }
        }

        return response

        #else
        throw NativeToolError.executionFailed("Location services not available on this platform.")
        #endif
    }

    #if os(iOS)
    private func reverseGeocode(location: CLLocation) async throws -> [String: Any] {
        let geocoder = CLGeocoder()
        let placemarks = try await geocoder.reverseGeocodeLocation(location)

        guard let placemark = placemarks.first else {
            throw NativeToolError.executionFailed("No address found for location.")
        }

        var address: [String: Any] = [:]

        if let name = placemark.name {
            address["name"] = name
        }
        if let street = placemark.thoroughfare {
            address["street"] = street
            if let number = placemark.subThoroughfare {
                address["streetNumber"] = number
            }
        }
        if let city = placemark.locality {
            address["city"] = city
        }
        if let state = placemark.administrativeArea {
            address["state"] = state
        }
        if let postalCode = placemark.postalCode {
            address["postalCode"] = postalCode
        }
        if let country = placemark.country {
            address["country"] = country
        }
        if let countryCode = placemark.isoCountryCode {
            address["countryCode"] = countryCode
        }

        // Build formatted address string
        var parts: [String] = []
        if let number = placemark.subThoroughfare, let street = placemark.thoroughfare {
            parts.append("\(number) \(street)")
        } else if let street = placemark.thoroughfare {
            parts.append(street)
        }
        if let city = placemark.locality {
            parts.append(city)
        }
        if let state = placemark.administrativeArea {
            parts.append(state)
        }
        if let country = placemark.country {
            parts.append(country)
        }
        if !parts.isEmpty {
            address["formatted"] = parts.joined(separator: ", ")
        }

        return address
    }
    #endif
}

// MARK: - Location Fetcher

#if os(iOS)
/// Result from location fetcher including accuracy authorization
struct LocationResult {
    let location: CLLocation
    let isReducedAccuracy: Bool
}

/// Async wrapper for CLLocationManager
@MainActor
private final class LocationFetcher: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var locationContinuation: CheckedContinuation<CLLocation, Error>?
    private var authContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }

    var isReducedAccuracy: Bool {
        locationManager.accuracyAuthorization == .reducedAccuracy
    }

    func getCurrentLocation() async throws -> CLLocation {
        // Check authorization
        let status = locationManager.authorizationStatus

        switch status {
        case .notDetermined:
            // Request permission and wait for user response
            return try await requestAuthorizationAndLocation()

        case .authorizedWhenInUse, .authorizedAlways:
            // Already authorized, just get location
            return try await requestLocation()

        case .denied:
            throw NativeToolError.executionFailed(
                "Location access denied. Please enable in Settings > Privacy > Location Services."
            )

        case .restricted:
            throw NativeToolError.executionFailed(
                "Location access restricted on this device."
            )

        @unknown default:
            throw NativeToolError.executionFailed("Unknown location authorization status.")
        }
    }

    private func requestAuthorizationAndLocation() async throws -> CLLocation {
        // Wait for user to make a choice in the permission dialog
        // iOS requires user to tap Allow Once/Allow While Using/Don't Allow - no dismiss option
        let newStatus = await withCheckedContinuation { continuation in
            self.authContinuation = continuation
            self.locationManager.requestWhenInUseAuthorization()
        }

        switch newStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            return try await requestLocation()

        case .denied:
            throw NativeToolError.executionFailed(
                "Location access denied. Please enable in Settings > Privacy > Location Services."
            )

        case .restricted:
            throw NativeToolError.executionFailed(
                "Location access restricted on this device."
            )

        case .notDetermined:
            throw NativeToolError.executionFailed(
                "Location permission not granted. Please try again."
            )

        @unknown default:
            throw NativeToolError.executionFailed("Unknown location authorization status.")
        }
    }

    private func requestLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            self.locationContinuation = continuation
            locationManager.requestLocation()
        }
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            // Only resume if user has made a decision (not still showing dialog)
            // When status is .notDetermined, user hasn't responded yet
            guard status != .notDetermined else { return }

            // Resume authorization continuation if waiting
            authContinuation?.resume(returning: status)
            authContinuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            locationContinuation?.resume(returning: location)
            locationContinuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let nsError = error as NSError
        let message: String

        if nsError.domain == kCLErrorDomain {
            switch CLError.Code(rawValue: nsError.code) {
            case .denied:
                message = "Location access denied."
            case .locationUnknown:
                message = "Unable to determine location. Please try again."
            case .network:
                message = "Network error while fetching location."
            default:
                message = "Location error: \(error.localizedDescription)"
            }
        } else {
            message = "Location error: \(error.localizedDescription)"
        }

        let toolError = NativeToolError.executionFailed(message)
        Task { @MainActor in
            locationContinuation?.resume(throwing: toolError)
            locationContinuation = nil
        }
    }
}
#endif
