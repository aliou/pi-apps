import XCTest

// MARK: - JSONValue

/// Lightweight recursive JSON value for encoding/decoding arbitrary params and data.
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    var stringValue: String? {
        guard case .string(let value) = self else { return nil }
        return value
    }

    var doubleValue: Double? {
        guard case .number(let value) = self else { return nil }
        return value
    }

    var intValue: Int? {
        guard case .number(let value) = self else { return nil }
        return Int(value)
    }

    var boolValue: Bool? {
        guard case .bool(let value) = self else { return nil }
        return value
    }

    subscript(key: String) -> JSONValue? {
        guard case .object(let dict) = self else { return nil }
        return dict[key]
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        // Bool must be decoded before Double to avoid true/false mapping to 1.0/0.0.
        if container.decodeNil() { self = .null; return }
        if let boolVal = try? container.decode(Bool.self) { self = .bool(boolVal); return }
        if let numVal = try? container.decode(Double.self) { self = .number(numVal); return }
        if let strVal = try? container.decode(String.self) { self = .string(strVal); return }
        if let arrVal = try? container.decode([JSONValue].self) { self = .array(arrVal); return }
        if let objVal = try? container.decode([String: JSONValue].self) { self = .object(objVal); return }
        throw DecodingError.typeMismatch(
            JSONValue.self,
            .init(codingPath: decoder.codingPath, debugDescription: "Unsupported JSON type")
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let strVal):  try container.encode(strVal)
        case .number(let numVal):  try container.encode(numVal)
        case .bool(let boolVal):   try container.encode(boolVal)
        case .null:                try container.encodeNil()
        case .array(let arrVal):   try container.encode(arrVal)
        case .object(let objVal):  try container.encode(objVal)
        }
    }
}

// MARK: - Protocol types

struct AutomationPayload: Decodable {
    let action: String
    let params: [String: JSONValue]?
    let metadata: [String: JSONValue]?
}

struct AutomationErrorDetail: Encodable {
    let message: String
    let code: String?
    let hint: String?

    init(message: String, code: String? = nil, hint: String? = nil) {
        self.message = message
        self.code = code
        self.hint = hint
    }

    private enum CodingKeys: String, CodingKey { case message, code, hint }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(message, forKey: .message)
        try container.encodeIfPresent(code, forKey: .code)
        try container.encodeIfPresent(hint, forKey: .hint)
    }
}

struct AutomationResult: Encodable {
    let isOk: Bool
    let action: String
    let data: [String: JSONValue]?
    let errors: [AutomationErrorDetail]?
    let warnings: [String]?

    private enum CodingKeys: String, CodingKey {
        case isOk = "ok"
        case action, data, errors, warnings
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(isOk, forKey: .isOk)
        try container.encode(action, forKey: .action)
        try container.encodeIfPresent(data, forKey: .data)
        try container.encodeIfPresent(errors, forKey: .errors)
        try container.encodeIfPresent(warnings, forKey: .warnings)
    }

    static func success(
        action: String,
        data: [String: JSONValue]? = nil,
        warnings: [String]? = nil
    ) -> AutomationResult {
        AutomationResult(isOk: true, action: action, data: data, errors: nil, warnings: warnings)
    }

    static func failure(
        action: String,
        message: String,
        code: String? = nil,
        hint: String? = nil
    ) -> AutomationResult {
        AutomationResult(
            isOk: false,
            action: action,
            data: nil,
            errors: [AutomationErrorDetail(message: message, code: code, hint: hint)],
            warnings: nil
        )
    }
}
