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

        // Build base response
        var response: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": ISO8601DateFormatter().string(from: location.timestamp)
        ]

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
/// Async wrapper for CLLocationManager
@MainActor
private final class LocationFetcher: NSObject, CLLocationManagerDelegate {
    private let locationManager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func getCurrentLocation() async throws -> CLLocation {
        // Check authorization
        let status = locationManager.authorizationStatus

        switch status {
        case .notDetermined:
            // Request permission and wait
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
        // Request when-in-use authorization
        locationManager.requestWhenInUseAuthorization()

        // Wait briefly for authorization response, then request location
        // The delegate will handle the authorization change
        try await Task.sleep(nanoseconds: 500_000_000)  // 0.5 seconds

        let newStatus = locationManager.authorizationStatus
        guard newStatus == .authorizedWhenInUse || newStatus == .authorizedAlways else {
            throw NativeToolError.executionFailed(
                "Location permission not granted. Please allow location access when prompted."
            )
        }

        return try await requestLocation()
    }

    private func requestLocation() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            locationManager.requestLocation()
        }
    }

    // MARK: - CLLocationManagerDelegate

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            if let location = locations.last {
                continuation?.resume(returning: location)
                continuation = nil
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
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

            continuation?.resume(throwing: NativeToolError.executionFailed(message))
            continuation = nil
        }
    }
}
#endif
