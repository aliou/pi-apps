import XCTest

/// Dispatches UI automation actions against the provided XCUIApplication.
/// All action logic lives here. The harness only reads/writes JSON and calls execute().
@MainActor
final class AutomationBridge {
    private let app: XCUIApplication
    let defaultTimeout: TimeInterval = 10

    init(app: XCUIApplication) {
        self.app = app
    }

    func execute(payload: AutomationPayload) -> AutomationResult {
        let params = payload.params ?? [:]
        switch payload.action {
        case "describe_ui": return describeUI(params: params)
        case "tap":         return tap(params: params)
        case "type":        return typeText(params: params)
        case "clear_text":  return clearText(params: params)
        case "query_text":  return queryText(params: params)
        case "wait_for":    return waitFor(params: params)
        case "assert":      return performAssert(params: params)
        default:
            return .failure(
                action: payload.action,
                message: "Unknown action '\(payload.action)'",
                code: "UNKNOWN_ACTION",
                hint: "Supported: describe_ui, tap, type, clear_text, query_text, wait_for, assert"
            )
        }
    }
}

// MARK: - describe_ui

extension AutomationBridge {
    func describeUI(params: [String: JSONValue]) -> AutomationResult {
        let interactiveTypes: [(XCUIElement.ElementType, String)] = [
            (.button, "Button"),
            (.staticText, "StaticText"),
            (.textField, "TextField"),
            (.secureTextField, "SecureTextField"),
            (.image, "Image"),
            (.cell, "Cell"),
            (.navigationBar, "NavigationBar"),
            (.tabBar, "TabBar"),
            (.link, "Link")
        ]

        var described: [JSONValue] = []
        var seen = Set<String>()

        for (elementType, typeName) in interactiveTypes {
            let query = app.descendants(matching: elementType)
            for index in 0 ..< query.count {
                let element = query.element(boundBy: index)
                guard element.exists else { continue }
                let key = "\(typeName)|\(element.identifier)|\(element.label)"
                guard !seen.contains(key) else { continue }
                seen.insert(key)
                let item: [String: JSONValue] = [
                    "type": .string(typeName),
                    "label": .string(element.label),
                    "identifier": .string(element.identifier),
                    "isHittable": .bool(element.isHittable)
                ]
                described.append(.object(item))
            }
        }

        return .success(action: "describe_ui", data: [
            "elements": .array(described),
            "count": .number(Double(described.count))
        ])
    }
}

// MARK: - tap

extension AutomationBridge {
    func tap(params: [String: JSONValue]) -> AutomationResult {
        if let identifier = params["identifier"]?.stringValue {
            let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
            guard element.waitForExistence(timeout: defaultTimeout) else {
                return .failure(
                    action: "tap",
                    message: "Element '\(identifier)' not found after \(Int(defaultTimeout))s",
                    code: "ELEMENT_NOT_FOUND",
                    hint: "Verify the accessibilityIdentifier set on the element."
                )
            }
            guard element.isHittable else {
                return .failure(
                    action: "tap",
                    message: "Element '\(identifier)' exists but is not hittable",
                    code: "ELEMENT_NOT_HITTABLE",
                    hint: "The element may be obscured or off-screen."
                )
            }
            element.tap()
            return .success(action: "tap", data: ["identifier": .string(identifier)])
        }

        if let xCoord = params["x"]?.doubleValue, let yCoord = params["y"]?.doubleValue {
            app.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: xCoord, dy: yCoord))
                .tap()
            return .success(action: "tap", data: [
                "coordinates": .object(["x": .number(xCoord), "y": .number(yCoord)])
            ])
        }

        return .failure(
            action: "tap",
            message: "Provide 'identifier' or both 'x' and 'y' coordinate params",
            code: "MISSING_PARAMS"
        )
    }
}

// MARK: - type

extension AutomationBridge {
    func typeText(params: [String: JSONValue]) -> AutomationResult {
        guard let text = params["text"]?.stringValue else {
            return .failure(action: "type", message: "Missing required param 'text'", code: "MISSING_PARAMS")
        }

        if let identifier = params["identifier"]?.stringValue {
            let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
            guard element.waitForExistence(timeout: defaultTimeout) else {
                return .failure(
                    action: "type",
                    message: "Field '\(identifier)' not found after \(Int(defaultTimeout))s",
                    code: "ELEMENT_NOT_FOUND",
                    hint: "Verify the accessibilityIdentifier set on the text field."
                )
            }
            element.tap()
            element.typeText(text)
            return .success(action: "type", data: [
                "identifier": .string(identifier),
                "textLength": .number(Double(text.count))
            ])
        }

        app.typeText(text)
        return .success(action: "type", data: ["textLength": .number(Double(text.count))])
    }
}

// MARK: - clear_text

extension AutomationBridge {
    func clearText(params: [String: JSONValue]) -> AutomationResult {
        guard let identifier = params["identifier"]?.stringValue else {
            return .failure(action: "clear_text", message: "Missing required param 'identifier'", code: "MISSING_PARAMS")
        }

        let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
        guard element.waitForExistence(timeout: defaultTimeout) else {
            return .failure(
                action: "clear_text",
                message: "Field '\(identifier)' not found after \(Int(defaultTimeout))s",
                code: "ELEMENT_NOT_FOUND"
            )
        }

        element.tap()

        // Select all existing text and delete it.
        let currentValue = (element.value as? String) ?? ""
        guard !currentValue.isEmpty else {
            return .success(action: "clear_text", data: ["identifier": .string(identifier)])
        }

        // Move to end, select all, then delete.
        element.press(forDuration: 1.2)
        let selectAll = app.menuItems["Select All"]
        if selectAll.waitForExistence(timeout: 2) {
            selectAll.tap()
            element.typeText(String(XCUIKeyboardKey.delete.rawValue))
        } else {
            // Fallback: delete character by character.
            let deleteString = String(repeating: String(XCUIKeyboardKey.delete.rawValue), count: currentValue.count)
            element.typeText(deleteString)
        }

        return .success(action: "clear_text", data: ["identifier": .string(identifier)])
    }
}

// MARK: - query_text

extension AutomationBridge {
    func queryText(params: [String: JSONValue]) -> AutomationResult {
        guard let text = params["text"]?.stringValue else {
            return .failure(action: "query_text", message: "Missing required param 'text'", code: "MISSING_PARAMS")
        }

        let matchMode = params["match"]?.stringValue ?? "contains"
        let predicate: NSPredicate = switch matchMode {
        case "exact": NSPredicate(format: "label ==[c] %@", text)
        default:      NSPredicate(format: "label CONTAINS[c] %@", text)
        }

        let query = app.descendants(matching: .any).matching(predicate)
        var found: [JSONValue] = []
        for index in 0 ..< query.count {
            let element = query.element(boundBy: index)
            guard element.exists else { continue }
            let item: [String: JSONValue] = [
                "label": .string(element.label),
                "identifier": .string(element.identifier),
                "type": .string(elementTypeName(element.elementType)),
                "isHittable": .bool(element.isHittable)
            ]
            found.append(.object(item))
        }

        return .success(action: "query_text", data: [
            "matches": .array(found),
            "count": .number(Double(found.count)),
            "text": .string(text),
            "match": .string(matchMode)
        ])
    }
}

// MARK: - wait_for

extension AutomationBridge {
    func waitFor(params: [String: JSONValue]) -> AutomationResult {
        guard let identifier = params["identifier"]?.stringValue else {
            return .failure(action: "wait_for", message: "Missing required param 'identifier'", code: "MISSING_PARAMS")
        }
        let state = params["state"]?.stringValue ?? "exists"
        let timeout = params["timeout"]?.doubleValue ?? defaultTimeout
        let start = Date()
        let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch

        switch state {
        case "exists":
            return waitForExists(identifier: identifier, element: element, timeout: timeout, start: start)
        case "hittable":
            return waitForHittable(identifier: identifier, element: element, timeout: timeout, start: start)
        case "absent":
            return waitForAbsent(identifier: identifier, element: element, timeout: timeout, start: start)
        default:
            return .failure(
                action: "wait_for",
                message: "Unknown state '\(state)'",
                code: "INVALID_PARAM",
                hint: "Supported states: exists, hittable, absent"
            )
        }
    }

    private func waitForExists(
        identifier: String, element: XCUIElement, timeout: TimeInterval, start: Date
    ) -> AutomationResult {
        let found = element.waitForExistence(timeout: timeout)
        let elapsed = Date().timeIntervalSince(start)
        guard found else {
            return .failure(
                action: "wait_for",
                message: "'\(identifier)' did not appear within \(timeout)s",
                code: "TIMEOUT",
                hint: "Increase 'timeout' or verify accessibilityIdentifier."
            )
        }
        return .success(action: "wait_for", data: [
            "identifier": .string(identifier),
            "state": .string("exists"),
            "elapsed": .number(elapsed)
        ])
    }

    private func waitForHittable(
        identifier: String, element: XCUIElement, timeout: TimeInterval, start: Date
    ) -> AutomationResult {
        let exp = XCTNSPredicateExpectation(
            predicate: NSPredicate { obj, _ in (obj as? XCUIElement)?.isHittable ?? false },
            object: element
        )
        let waiterResult = XCTWaiter().wait(for: [exp], timeout: timeout)
        let elapsed = Date().timeIntervalSince(start)
        guard waiterResult == .completed else {
            return .failure(
                action: "wait_for",
                message: "'\(identifier)' not hittable within \(timeout)s",
                code: "TIMEOUT",
                hint: "Element may exist but be obscured or off-screen."
            )
        }
        return .success(action: "wait_for", data: [
            "identifier": .string(identifier),
            "state": .string("hittable"),
            "elapsed": .number(elapsed)
        ])
    }

    private func waitForAbsent(
        identifier: String, element: XCUIElement, timeout: TimeInterval, start: Date
    ) -> AutomationResult {
        let exp = XCTNSPredicateExpectation(
            predicate: NSPredicate { obj, _ in
                guard let xcElement = obj as? XCUIElement else { return true }
                return !xcElement.exists
            },
            object: element
        )
        let waiterResult = XCTWaiter().wait(for: [exp], timeout: timeout)
        let elapsed = Date().timeIntervalSince(start)
        guard waiterResult == .completed else {
            return .failure(
                action: "wait_for",
                message: "'\(identifier)' still present after \(timeout)s",
                code: "TIMEOUT"
            )
        }
        return .success(action: "wait_for", data: [
            "identifier": .string(identifier),
            "state": .string("absent"),
            "elapsed": .number(elapsed)
        ])
    }
}

// MARK: - assert

extension AutomationBridge {
    func performAssert(params: [String: JSONValue]) -> AutomationResult {
        guard let identifier = params["identifier"]?.stringValue else {
            return .failure(action: "assert", message: "Missing required param 'identifier'", code: "MISSING_PARAMS")
        }
        let element = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
        var failures: [AutomationErrorDetail] = []

        if let expectExists = params["exists"]?.boolValue {
            let actual = element.exists
            if actual != expectExists {
                failures.append(AutomationErrorDetail(
                    message: "'\(identifier)' exists=\(actual), expected \(expectExists)",
                    code: "ASSERT_EXISTS_FAILED"
                ))
            }
        }

        if let expectHittable = params["hittable"]?.boolValue {
            let actual = element.exists && element.isHittable
            if actual != expectHittable {
                failures.append(AutomationErrorDetail(
                    message: "'\(identifier)' hittable=\(actual), expected \(expectHittable)",
                    code: "ASSERT_HITTABLE_FAILED"
                ))
            }
        }

        if let expectLabel = params["label"]?.stringValue {
            let actual = element.label
            if actual != expectLabel {
                failures.append(AutomationErrorDetail(
                    message: "'\(identifier)' label='\(actual)', expected '\(expectLabel)'",
                    code: "ASSERT_LABEL_FAILED"
                ))
            }
        }

        if failures.isEmpty {
            return AutomationResult(
                isOk: true, action: "assert",
                data: ["identifier": .string(identifier)],
                errors: nil, warnings: nil
            )
        }
        return AutomationResult(
            isOk: false, action: "assert",
            data: ["identifier": .string(identifier)],
            errors: failures, warnings: nil
        )
    }
}

// MARK: - Helpers

extension AutomationBridge {
    func elementTypeName(_ type: XCUIElement.ElementType) -> String {
        let names: [XCUIElement.ElementType: String] = [
            .button: "Button",
            .staticText: "StaticText",
            .textField: "TextField",
            .secureTextField: "SecureTextField",
            .image: "Image",
            .cell: "Cell",
            .navigationBar: "NavigationBar",
            .tabBar: "TabBar",
            .link: "Link",
            .scrollView: "ScrollView",
            .other: "Other"
        ]
        return names[type] ?? "Element(\(type.rawValue))"
    }
}
