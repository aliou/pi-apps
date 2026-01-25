//
//  DeviceInfoTool.swift
//  pi
//
//  Returns information about the current macOS device
//

import Foundation
import PiCore

/// Returns information about the current macOS device
struct DeviceInfoTool: NativeToolExecutable {
    static let definition = NativeToolDefinition(
        name: "device_info",
        description: "Get information about the current macOS device including OS version, hardware model, and system resources",
        parameters: [
            "type": AnyCodable("object"),
            "properties": AnyCodable([String: Any]()),
            "required": AnyCodable([String]())
        ]
    )

    func execute(args: [String: AnyCodable], onCancel: @escaping @Sendable () -> Void) async throws -> [String: Any] {
        let processInfo = ProcessInfo.processInfo

        return [
            "platform": "macOS",
            "osVersion": processInfo.operatingSystemVersionString,
            "model": getMacModel(),
            "chip": getChipInfo(),
            "memoryGB": Double(processInfo.physicalMemory) / 1_073_741_824,
            "processorCount": processInfo.processorCount,
            "hostname": Host.current().localizedName ?? "Unknown",
            "uptime": processInfo.systemUptime
        ]
    }

    private func getMacModel() -> String {
        var size = 0
        sysctlbyname("hw.model", nil, &size, nil, 0)
        var model = [CChar](repeating: 0, count: size)
        sysctlbyname("hw.model", &model, &size, nil, 0)
        return String(cString: model)
    }

    private func getChipInfo() -> String {
        var size = 0
        sysctlbyname("machdep.cpu.brand_string", nil, &size, nil, 0)
        var brand = [CChar](repeating: 0, count: size)
        sysctlbyname("machdep.cpu.brand_string", &brand, &size, nil, 0)
        let brandString = String(cString: brand)

        // On Apple Silicon, machdep.cpu.brand_string might be empty
        if brandString.isEmpty {
            // Check for Apple Silicon
            var sysname = utsname()
            uname(&sysname)
            let machine = withUnsafePointer(to: &sysname.machine) {
                $0.withMemoryRebound(to: CChar.self, capacity: 1) {
                    String(cString: $0)
                }
            }

            if machine.hasPrefix("arm64") {
                return "Apple Silicon"
            }
        }

        return brandString.isEmpty ? "Unknown" : brandString
    }
}
