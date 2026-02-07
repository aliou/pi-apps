import Foundation

extension Relay {
    public enum AnyCodable: Sendable, Hashable, Codable {
        case null
        case bool(Bool)
        case int(Int)
        case double(Double)
        case string(String)
        case array([AnyCodable])
        case object([String: AnyCodable])

        // MARK: - Codable

        public init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()

            if container.decodeNil() {
                self = .null
            } else if let bool = try? container.decode(Bool.self) {
                self = .bool(bool)
            } else if let int = try? container.decode(Int.self) {
                self = .int(int)
            } else if let double = try? container.decode(Double.self) {
                self = .double(double)
            } else if let string = try? container.decode(String.self) {
                self = .string(string)
            } else if let array = try? container.decode([AnyCodable].self) {
                self = .array(array)
            } else if let object = try? container.decode([String: AnyCodable].self) {
                self = .object(object)
            } else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode AnyCodable")
            }
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()

            switch self {
            case .null:
                try container.encodeNil()
            case let .bool(value):
                try container.encode(value)
            case let .int(value):
                try container.encode(value)
            case let .double(value):
                try container.encode(value)
            case let .string(value):
                try container.encode(value)
            case let .array(value):
                try container.encode(value)
            case let .object(value):
                try container.encode(value)
            }
        }

        // MARK: - Subscript Access

        public subscript(key: String) -> AnyCodable? {
            guard case let .object(dict) = self else { return nil }
            return dict[key]
        }

        public subscript(index: Int) -> AnyCodable? {
            guard case let .array(array) = self else { return nil }
            guard index >= 0, index < array.count else { return nil }
            return array[index]
        }

        // MARK: - Convenience Properties

        public var stringValue: String? {
            guard case let .string(value) = self else { return nil }
            return value
        }

        public var intValue: Int? {
            guard case let .int(value) = self else { return nil }
            return value
        }

        public var doubleValue: Double? {
            guard case let .double(value) = self else { return nil }
            return value
        }

        public var boolValue: Bool? {
            guard case let .bool(value) = self else { return nil }
            return value
        }

        public var arrayValue: [AnyCodable]? {
            guard case let .array(value) = self else { return nil }
            return value
        }

        public var objectValue: [String: AnyCodable]? {
            guard case let .object(value) = self else { return nil }
            return value
        }

        public var isNull: Bool {
            guard case .null = self else { return false }
            return true
        }

        // MARK: - ExpressibleBy Literals

        public static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
            switch (lhs, rhs) {
            case (.null, .null):
                return true
            case let (.bool(lhsVal), .bool(rhsVal)):
                return lhsVal == rhsVal
            case let (.int(lhsVal), .int(rhsVal)):
                return lhsVal == rhsVal
            case let (.double(lhsVal), .double(rhsVal)):
                return lhsVal == rhsVal
            case let (.string(lhsVal), .string(rhsVal)):
                return lhsVal == rhsVal
            case let (.array(lhsVal), .array(rhsVal)):
                return lhsVal == rhsVal
            case let (.object(lhsVal), .object(rhsVal)):
                return lhsVal == rhsVal
            default:
                return false
            }
        }

        public func hash(into hasher: inout Hasher) {
            switch self {
            case .null:
                hasher.combine(0)
            case let .bool(value):
                hasher.combine(1)
                hasher.combine(value)
            case let .int(value):
                hasher.combine(2)
                hasher.combine(value)
            case let .double(value):
                hasher.combine(3)
                hasher.combine(value)
            case let .string(value):
                hasher.combine(4)
                hasher.combine(value)
            case let .array(value):
                hasher.combine(5)
                hasher.combine(value)
            case let .object(value):
                hasher.combine(6)
                hasher.combine(value)
            }
        }
    }
}

// MARK: - ExpressibleBy Protocols

extension Relay.AnyCodable: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self = .string(value)
    }
}

extension Relay.AnyCodable: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self = .int(value)
    }
}

extension Relay.AnyCodable: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self = .double(value)
    }
}

extension Relay.AnyCodable: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self = .bool(value)
    }
}

extension Relay.AnyCodable: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self = .null
    }
}

extension Relay.AnyCodable: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: Relay.AnyCodable...) {
        self = .array(elements)
    }
}

extension Relay.AnyCodable: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, Relay.AnyCodable)...) {
        self = .object(Dictionary(uniqueKeysWithValues: elements))
    }
}
