//
//  DeviceInfoTool.swift
//  Pi
//
//  Native tool for getting device information
//

import UIKit
import PiCore

/// Tool for retrieving iOS device information.
public struct DeviceInfoTool: NativeToolExecutable {

    public static let definition = NativeToolDefinition(
        name: "get_device_info",
        description: """
            Get information about the iOS device including name, model, OS version, \
            battery status, and device type (iPhone, iPad, Mac, etc.)
            """,
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([String: Any]())
        ]
    )

    public init() {}

    public func execute(
        args: [String: AnyCodable],
        onCancel: @escaping @Sendable () -> Void
    ) async throws -> [String: Any] {
        // This tool doesn't require special permissions
        // Tools that do (e.g., calendar) would request them here

        // Gather device info on main actor, then convert to sendable types
        let info = await MainActor.run { () -> DeviceInfoResult in
            let device = UIDevice.current
            device.isBatteryMonitoringEnabled = true

            return DeviceInfoResult(
                name: device.name,
                model: device.model,
                localizedModel: device.localizedModel,
                systemName: device.systemName,
                systemVersion: device.systemVersion,
                identifierForVendor: device.identifierForVendor?.uuidString ?? "unknown",
                batteryLevel: device.batteryLevel,
                batteryState: batteryStateString(device.batteryState),
                userInterfaceIdiom: idiomString(device.userInterfaceIdiom)
            )
        }

        return info.toDictionary()
    }

    /// Sendable container for device info
    private struct DeviceInfoResult: Sendable {
        let name: String
        let model: String
        let localizedModel: String
        let systemName: String
        let systemVersion: String
        let identifierForVendor: String
        let batteryLevel: Float
        let batteryState: String
        let userInterfaceIdiom: String

        func toDictionary() -> [String: Any] {
            [
                "name": name,
                "model": model,
                "localizedModel": localizedModel,
                "systemName": systemName,
                "systemVersion": systemVersion,
                "identifierForVendor": identifierForVendor,
                "batteryLevel": batteryLevel,
                "batteryState": batteryState,
                "userInterfaceIdiom": userInterfaceIdiom
            ]
        }
    }

    private nonisolated func batteryStateString(_ state: UIDevice.BatteryState) -> String {
        switch state {
        case .unknown: return "unknown"
        case .unplugged: return "unplugged"
        case .charging: return "charging"
        case .full: return "full"
        @unknown default: return "unknown"
        }
    }

    private nonisolated func idiomString(_ idiom: UIUserInterfaceIdiom) -> String {
        switch idiom {
        case .phone: return "iPhone"
        case .pad: return "iPad"
        case .mac: return "Mac"
        case .tv: return "Apple TV"
        case .carPlay: return "CarPlay"
        case .vision: return "Apple Vision"
        @unknown default: return "unknown"
        }
    }
}
