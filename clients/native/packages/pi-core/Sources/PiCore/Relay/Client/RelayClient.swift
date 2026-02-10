import Foundation

extension Relay {
    public actor RelayClient {
        public let baseURL: URL
        private let session: URLSession
        private let decoder: JSONDecoder

        public init(baseURL: URL) {
            self.baseURL = baseURL
            self.session = URLSession.shared
            self.decoder = JSONDecoder()
        }

        // MARK: - Health

        public func health() async throws -> HealthResponse {
            try await get("/health")
        }

        // MARK: - Sessions

        public func listSessions() async throws -> [RelaySession] {
            let response: APIResponse<[RelaySession]> = try await get("/api/sessions")
            guard let data = response.data else {
                throw RelayError.apiError(message: response.error ?? "No data")
            }
            return data
        }

        public func createSession(_ request: CreateSessionRequest) async throws -> CreateSessionResponse {
            let response: APIResponse<CreateSessionResponse> = try await post("/api/sessions", body: request)
            guard let data = response.data else {
                throw RelayError.apiError(message: response.error ?? "No data")
            }
            return data
        }

        public func getSession(id: String) async throws -> RelaySession {
            let response: APIResponse<RelaySession> = try await get("/api/sessions/\(id)")
            guard let data = response.data else {
                throw RelayError.apiError(message: response.error ?? "No data")
            }
            return data
        }

        public func archiveSession(id: String) async throws {
            let _: APIResponse<AnyCodable> = try await post("/api/sessions/\(id)/archive")
        }

        public func deleteSession(id: String) async throws {
            let _: APIResponse<AnyCodable> = try await delete("/api/sessions/\(id)")
        }

        public func activateSession(id: String) async throws -> ActivateSessionResponse {
            let response: APIResponse<ActivateSessionResponse> = try await post("/api/sessions/\(id)/activate")
            guard let data = response.data else {
                throw RelayError.apiError(message: response.error ?? "No data")
            }
            return data
        }

        public func getSessionHistory(id: String) async throws -> SessionHistoryResponse {
            let response: APIResponse<SessionHistoryResponse> = try await get("/api/sessions/\(id)/history")
            guard let data = response.data else {
                throw RelayError.apiError(message: response.error ?? "No data")
            }
            return data
        }

        // MARK: - Models

        public func listModels() async throws -> [ModelInfo] {
            let response: APIResponse<[ModelInfo]> = try await get("/api/models")
            return response.data ?? []
        }

        // MARK: - GitHub

        public func listRepos() async throws -> [GitHubRepo] {
            let response: APIResponse<[GitHubRepo]> = try await get("/api/github/repos")
            return response.data ?? []
        }

        // MARK: - Environments

        public func listEnvironments() async throws -> [RelayEnvironment] {
            let response: APIResponse<[RelayEnvironment]> = try await get("/api/environments")
            return response.data ?? []
        }

        // MARK: - Private helpers

        private func get<T: Decodable & Sendable>(_ path: String) async throws -> T {
            let url = baseURL.appendingPathComponent(path)
            let (data, response) = try await session.data(from: url)
            try validateHTTPResponse(response)
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw RelayError.decodingFailed(underlying: error)
            }
        }

        private func post<T: Decodable & Sendable>(_ path: String) async throws -> T {
            var request = URLRequest(url: baseURL.appendingPathComponent(path))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let (data, response) = try await session.data(for: request)
            try validateHTTPResponse(response)
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw RelayError.decodingFailed(underlying: error)
            }
        }

        private func post<Body: Encodable & Sendable, T: Decodable & Sendable>(
            _ path: String, body: Body
        ) async throws -> T {
            var request = URLRequest(url: baseURL.appendingPathComponent(path))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
            let (data, response) = try await session.data(for: request)
            try validateHTTPResponse(response)
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw RelayError.decodingFailed(underlying: error)
            }
        }

        @discardableResult
        private func delete<T: Decodable & Sendable>(_ path: String) async throws -> T {
            var request = URLRequest(url: baseURL.appendingPathComponent(path))
            request.httpMethod = "DELETE"
            let (data, response) = try await session.data(for: request)
            try validateHTTPResponse(response)
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw RelayError.decodingFailed(underlying: error)
            }
        }

        private func validateHTTPResponse(_ response: URLResponse) throws {
            guard let httpResponse = response as? HTTPURLResponse else {
                throw RelayError.httpError(statusCode: 0)
            }
            guard (200...299).contains(httpResponse.statusCode) else {
                throw RelayError.httpError(statusCode: httpResponse.statusCode)
            }
        }
    }

    public enum RelayError: Error, LocalizedError {
        case httpError(statusCode: Int)
        case connectionFailed(underlying: Error)
        case decodingFailed(underlying: Error)
        case apiError(message: String)

        public var errorDescription: String? {
            switch self {
            case .httpError(let code):
                "HTTP error \(code)"
            case .connectionFailed(let error):
                "Connection failed: \(error.localizedDescription)"
            case .decodingFailed(let error):
                "Decoding failed: \(error.localizedDescription)"
            case .apiError(let message):
                "API error: \(message)"
            }
        }
    }
}
