import Foundation

extension Relay {
    public struct APIResponse<T: Codable & Sendable>: Codable, Sendable {
        public let data: T?
        public let error: String?

        public var isSuccess: Bool { error == nil && data != nil }

        public init(data: T? = nil, error: String? = nil) {
            self.data = data
            self.error = error
        }
    }
}
