//
//  RelayAPIClient.swift
//  PiCore
//
//  REST client for relay server API
//

import Foundation

/// REST client for relay server API
public actor RelayAPIClient {
    public let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    public init(baseURL: URL) {
        self.baseURL = baseURL
        self.session = URLSession.shared
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    // MARK: - Health

    public func health() async throws -> HealthResponse {
        try await get("/health")
    }

    // MARK: - Sessions

    public func listSessions() async throws -> [RelaySession] {
        let response: RelayResponse<[RelaySession]> = try await get("/api/sessions")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func createSession(_ params: CreateSessionParams) async throws -> RelaySession {
        let response: RelayResponse<RelaySession> = try await post("/api/sessions", body: params)
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func getSession(id: String) async throws -> RelaySession {
        let response: RelayResponse<RelaySession> = try await get("/api/sessions/\(id)")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "Session not found")
        }
        return data
    }

    public func getConnectionInfo(sessionId: String) async throws -> ConnectionInfo {
        let response: RelayResponse<ConnectionInfo> = try await get("/api/sessions/\(sessionId)/connect")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func getEvents(sessionId: String, afterSeq: Int? = nil, limit: Int? = nil) async throws -> EventsResponse {
        var path = "/api/sessions/\(sessionId)/events"
        var queryItems: [String] = []
        if let afterSeq { queryItems.append("afterSeq=\(afterSeq)") }
        if let limit { queryItems.append("limit=\(limit)") }
        if !queryItems.isEmpty { path += "?" + queryItems.joined(separator: "&") }

        let response: RelayResponse<EventsResponse> = try await get(path)
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func deleteSession(id: String) async throws {
        let _: RelayResponse<DeleteResult> = try await delete("/api/sessions/\(id)")
    }

    // MARK: - Models

    /// Get available models based on configured secrets.
    /// This returns built-in providers only. For the full list including
    /// extension-defined providers, use get_available_models via RPC.
    public func getModels() async throws -> [Model] {
        let response: RelayResponse<[Model]> = try await get("/api/models")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    // MARK: - Environments

    /// List all environments
    public func listEnvironments() async throws -> [RelayEnvironment] {
        let response: RelayResponse<[RelayEnvironment]> = try await get("/api/environments")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    /// Get available Docker images for environment creation
    public func getAvailableImages() async throws -> [AvailableImage] {
        let response: RelayResponse<[AvailableImage]> = try await get("/api/environments/images")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    /// Get a single environment by ID
    public func getEnvironment(id: String) async throws -> RelayEnvironment {
        let response: RelayResponse<RelayEnvironment> = try await get("/api/environments/\(id)")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "Environment not found")
        }
        return data
    }

    // MARK: - GitHub

    public func getGitHubTokenStatus() async throws -> GitHubTokenStatus {
        let response: RelayResponse<GitHubTokenStatus> = try await get("/api/github/token")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func setGitHubToken(_ token: String) async throws -> GitHubTokenInfo {
        struct Body: Encodable { let token: String }
        let response: RelayResponse<GitHubTokenInfo> = try await post("/api/github/token", body: Body(token: token))
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "Invalid token")
        }
        return data
    }

    public func deleteGitHubToken() async throws {
        let _: RelayResponse<DeleteResult> = try await delete("/api/github/token")
    }

    public func listRepos() async throws -> [RepoInfo] {
        let response: RelayResponse<[RepoInfo]> = try await get("/api/github/repos")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    // MARK: - Secrets

    public func listSecrets() async throws -> [SecretMetadata] {
        let response: RelayResponse<[SecretMetadata]> = try await get("/api/secrets")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    public func hasSecret(id: SecretId) async throws -> Bool {
        let response: RelayResponse<SecretStatus> = try await get("/api/secrets/\(id.rawValue)")
        return response.data?.configured ?? false
    }

    public func setSecret(id: SecretId, value: String) async throws {
        struct Body: Encodable { let value: String }
        let _: RelayResponse<OkResult> = try await put("/api/secrets/\(id.rawValue)", body: Body(value: value))
    }

    public func deleteSecret(id: SecretId) async throws {
        let _: RelayResponse<OkResult> = try await delete("/api/secrets/\(id.rawValue)")
    }

    public func getSecretSchema() async throws -> [SecretSchemaItem] {
        let response: RelayResponse<[SecretSchemaItem]> = try await get("/api/secrets/schema/ids")
        guard let data = response.data else {
            throw RelayAPIError.serverError(response.error ?? "No data")
        }
        return data
    }

    // MARK: - Settings

    public func getSettings() async throws -> [String: AnyCodable] {
        let response: RelayResponse<[String: AnyCodable]> = try await get("/api/settings")
        return response.data ?? [:]
    }

    public func setSetting(key: String, value: AnyCodable) async throws {
        struct Body: Encodable {
            let key: String
            let value: AnyCodable
        }
        let _: RelayResponse<OkResult> = try await put("/api/settings", body: Body(key: key, value: value))
    }

    // MARK: - Private Helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        return try await execute(request)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        request.httpBody = try encoder.encode(body)

        return try await execute(request)
    }

    private func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        request.httpBody = try encoder.encode(body)

        return try await execute(request)
    }

    private func delete<T: Decodable>(_ path: String) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        return try await execute(request)
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw RelayAPIError.serverError("Invalid response")
            }

            if httpResponse.statusCode >= 400 {
                // Try to parse error from response
                if let errorResponse = try? decoder.decode(RelayResponse<String>.self, from: data),
                   let error = errorResponse.error {
                    throw RelayAPIError.serverError(error)
                }
                throw RelayAPIError.serverError("HTTP \(httpResponse.statusCode)")
            }

            return try decoder.decode(T.self, from: data)
        } catch let error as RelayAPIError {
            throw error
        } catch let error as DecodingError {
            throw RelayAPIError.decodingError(error)
        } catch {
            throw RelayAPIError.networkError(error)
        }
    }
}

public enum RelayAPIError: Error, LocalizedError, Sendable {
    case networkError(Error)
    case invalidURL
    case serverError(String)
    case decodingError(Error)

    public var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .invalidURL:
            return "Invalid URL"
        case .serverError(let message):
            return "Server error: \(message)"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        }
    }
}
