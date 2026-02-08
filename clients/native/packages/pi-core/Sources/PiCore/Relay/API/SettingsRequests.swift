import Foundation

extension Relay {
    public struct SetSettingRequest: Codable, Sendable {
        public let key: String
        public let value: AnyCodable

        public init(key: String, value: AnyCodable) {
            self.key = key
            self.value = value
        }
    }

    public struct SandboxProvidersStatus: Codable, Sendable, Hashable {
        public let docker: DockerStatus

        public init(docker: DockerStatus) {
            self.docker = docker
        }
    }
}

extension Relay.SandboxProvidersStatus {
    public struct DockerStatus: Codable, Sendable, Hashable {
        public let available: Bool

        public init(available: Bool) {
            self.available = available
        }
    }
}
