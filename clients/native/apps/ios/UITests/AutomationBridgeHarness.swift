import XCTest

/// Entry point for the UI automation bridge.
///
/// One test method reads a JSON action payload from the environment, dispatches it
/// through AutomationBridge, and writes the structured result back as JSON.
///
/// External callers should invoke only this test method:
///   -only-testing "PiNative UITests/AutomationBridgeHarness/testRunAction"
///
/// See docs/ui-automation-bridge.md for the full contract.
@MainActor
final class AutomationBridgeHarness: XCTestCase {
    func testRunAction() throws {
        // Read payload before touching the app.
        let payload: AutomationPayload
        do {
            payload = try readPayload()
        } catch AutomationHarnessError.missingPayload {
            let result = AutomationResult.failure(
                action: "unknown",
                message: "Missing automation payload.",
                code: "MISSING_PAYLOAD",
                hint: "Set UI_AUTOMATION_PAYLOAD_PATH (file path) or UI_AUTOMATION_PAYLOAD_JSON (inline JSON)."
            )
            writeResult(result)
            return
        } catch {
            let result = AutomationResult.failure(
                action: "unknown",
                message: "Failed to read payload: \(error.localizedDescription)",
                code: "PAYLOAD_READ_ERROR",
                hint: "Set UI_AUTOMATION_PAYLOAD_PATH (file path) or UI_AUTOMATION_PAYLOAD_JSON (inline JSON)."
            )
            writeResult(result)
            return
        }

        // Launch or bring the app to the foreground.
        let app = XCUIApplication()
        if app.state == .notRunning || app.state == .unknown {
            app.launch()
        } else {
            app.activate()
        }

        let bridge = AutomationBridge(app: app)
        let result = bridge.execute(payload: payload)
        writeResult(result)
    }

    // MARK: - Payload I/O

    private func readPayload() throws -> AutomationPayload {
        let env = ProcessInfo.processInfo.environment

        if let path = env["UI_AUTOMATION_PAYLOAD_PATH"], !path.isEmpty {
            guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
                throw AutomationHarnessError.fileNotFound(path)
            }
            return try JSONDecoder().decode(AutomationPayload.self, from: data)
        }

        if let json = env["UI_AUTOMATION_PAYLOAD_JSON"], !json.isEmpty,
           let data = json.data(using: .utf8) {
            return try JSONDecoder().decode(AutomationPayload.self, from: data)
        }

        throw AutomationHarnessError.missingPayload
    }

    private func writeResult(_ result: AutomationResult) {
        guard let data = try? JSONEncoder().encode(result),
              let json = String(data: data, encoding: .utf8)
        else {
            print("[AutomationBridgeHarness] ERROR: could not encode result")
            return
        }

        // Always print to stdout for immediate CLI consumption.
        print(json)

        let env = ProcessInfo.processInfo.environment
        if let path = env["UI_AUTOMATION_RESULT_PATH"], !path.isEmpty {
            do {
                try data.write(to: URL(fileURLWithPath: path), options: .atomic)
            } catch {
                print("[AutomationBridgeHarness] WARNING: could not write result to \(path): \(error)")
            }
        }
    }
}

// MARK: - Harness errors

private enum AutomationHarnessError: Error, LocalizedError {
    case missingPayload
    case fileNotFound(String)

    var errorDescription: String? {
        switch self {
        case .missingPayload:
            return "No payload source. Set UI_AUTOMATION_PAYLOAD_PATH or UI_AUTOMATION_PAYLOAD_JSON."
        case .fileNotFound(let path):
            return "Payload file not found at '\(path)'."
        }
    }
}
