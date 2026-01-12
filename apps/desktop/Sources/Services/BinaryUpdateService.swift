//
//  BinaryUpdateService.swift
//  pi
//
//  Handles downloading and updating the pi binary from GitHub releases
//

import Foundation

// MARK: - Types

struct VersionInfo: Codable {
    var currentVersion: String?
    var lastCheckDate: Date?
    var latestKnownVersion: String?
}

struct GitHubRelease: Codable {
    let tagName: String
    let assets: [GitHubAsset]

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case assets
    }
}

struct GitHubAsset: Codable {
    let name: String
    let browserDownloadUrl: String

    enum CodingKeys: String, CodingKey {
        case name
        case browserDownloadUrl = "browser_download_url"
    }
}

enum BinaryUpdateError: Error, LocalizedError {
    case networkError(Error)
    case noReleasesFound
    case noCompatibleAsset
    case downloadFailed
    case extractionFailed
    case fileOperationFailed(Error)

    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .noReleasesFound:
            return "No releases found on GitHub"
        case .noCompatibleAsset:
            return "No compatible binary found for this platform"
        case .downloadFailed:
            return "Failed to download the binary"
        case .extractionFailed:
            return "Failed to extract the binary"
        case .fileOperationFailed(let error):
            return "File operation failed: \(error.localizedDescription)"
        }
    }
}

enum UpdateCheckResult {
    case upToDate
    case updateAvailable(version: String)
    case checkFailed(Error)
}

// MARK: - BinaryUpdateService

actor BinaryUpdateService {
    static let shared = BinaryUpdateService()

    private let githubOwner = "badlogic"
    private let githubRepo = "pi-mono"
    private let platform = "darwin"
    private let arch = "arm64"



    private var versionInfo: VersionInfo

    private init() {
        versionInfo = Self.loadVersionInfo()
    }

    // MARK: - Public API

    /// Check if the pi binary exists
    var binaryExists: Bool {
        AppPaths.piExecutableExists
    }

    /// Current installed version (if known)
    var currentVersion: String? {
        versionInfo.currentVersion
    }

    /// Latest known version from last check
    var latestKnownVersion: String? {
        versionInfo.latestKnownVersion
    }

    /// Whether an update is available
    var updateAvailable: Bool {
        guard let current = currentVersion,
              let latest = latestKnownVersion else {
            return false
        }
        return latest != current
    }

    /// Download the latest pi binary (for first launch or manual update)
    func downloadLatestBinary(progress: @escaping (Double, String) -> Void) async throws {
        progress(0.0, "Fetching latest release...")

        // Get latest release info
        let release = try await fetchLatestRelease()
        let version = release.tagName

        progress(0.1, "Found version \(version)")

        // Find the right asset
        let assetName = "pi-\(platform)-\(arch).tar.gz"
        guard let asset = release.assets.first(where: { $0.name == assetName }) else {
            throw BinaryUpdateError.noCompatibleAsset
        }

        progress(0.2, "Downloading binary...")

        // Download to temp location
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let tarPath = tempDir.appendingPathComponent("pi.tar.gz")
        try await downloadFile(from: asset.browserDownloadUrl, to: tarPath) { p in
            progress(0.2 + p * 0.6, "Downloading... \(Int(p * 100))%")
        }

        progress(0.8, "Extracting...")

        // Extract to temp directory
        try extractTarGz(at: tarPath, to: tempDir)

        progress(0.9, "Installing...")

        // Clear existing bin directory contents (except preserve any user config)
        let binDir = AppPaths.binDirectory
        let fm = FileManager.default

        // Remove old contents
        if let contents = try? fm.contentsOfDirectory(at: binDir, includingPropertiesForKeys: nil) {
            for item in contents {
                try? fm.removeItem(at: item)
            }
        }

        // Move all extracted files to bin directory
        let extractedContents = try fm.contentsOfDirectory(at: tempDir, includingPropertiesForKeys: nil)
        for item in extractedContents {
            // Skip the tarball itself
            if item.lastPathComponent == "pi.tar.gz" { continue }

            let destination = binDir.appendingPathComponent(item.lastPathComponent)
            try fm.moveItem(at: item, to: destination)
        }

        // Make binary executable
        let binaryPath = AppPaths.piExecutable
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: binaryPath.path)

        // Update version info
        versionInfo.currentVersion = version
        versionInfo.latestKnownVersion = version
        versionInfo.lastCheckDate = Date()
        saveVersionInfo()

        progress(1.0, "Done!")
    }

    /// Check for updates (called on app launch)
    func checkForUpdates() async -> UpdateCheckResult {
        do {
            let release = try await fetchLatestRelease()
            let latestVersion = release.tagName

            versionInfo.latestKnownVersion = latestVersion
            versionInfo.lastCheckDate = Date()
            saveVersionInfo()

            if let current = versionInfo.currentVersion, current != latestVersion {
                return .updateAvailable(version: latestVersion)
            }

            return .upToDate
        } catch {
            return .checkFailed(error)
        }
    }

    /// Apply a pending update
    func applyUpdate(progress: @escaping (Double, String) -> Void) async throws {
        try await downloadLatestBinary(progress: progress)
    }

    // MARK: - Private Methods

    private func fetchLatestRelease() async throws -> GitHubRelease {
        let urlString = "https://api.github.com/repos/\(githubOwner)/\(githubRepo)/releases/latest"
        guard let url = URL(string: urlString) else {
            throw BinaryUpdateError.networkError(URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.setValue("application/vnd.github.v3+json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BinaryUpdateError.noReleasesFound
        }

        let decoder = JSONDecoder()
        return try decoder.decode(GitHubRelease.self, from: data)
    }

    private func downloadFile(from urlString: String, to destination: URL, progress: @escaping (Double) -> Void) async throws {
        guard let url = URL(string: urlString) else {
            throw BinaryUpdateError.downloadFailed
        }

        let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)

        let expectedLength = response.expectedContentLength
        var receivedLength: Int64 = 0
        var data = Data()
        data.reserveCapacity(expectedLength > 0 ? Int(expectedLength) : 10_000_000)

        for try await byte in asyncBytes {
            data.append(byte)
            receivedLength += 1

            if expectedLength > 0 && receivedLength % 100_000 == 0 {
                let p = Double(receivedLength) / Double(expectedLength)
                progress(min(p, 1.0))
            }
        }

        progress(1.0)

        try data.write(to: destination)
    }

    private func extractTarGz(at tarPath: URL, to destination: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
        process.arguments = ["-xzf", tarPath.path, "-C", destination.path]
        process.standardOutput = nil
        process.standardError = nil

        try process.run()
        process.waitUntilExit()

        guard process.terminationStatus == 0 else {
            throw BinaryUpdateError.extractionFailed
        }
    }

    // MARK: - Persistence

    private static func loadVersionInfo() -> VersionInfo {
        let path = AppPaths.versionFile
        guard FileManager.default.fileExists(atPath: path.path),
              let data = try? Data(contentsOf: path) else {
            return VersionInfo()
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(VersionInfo.self, from: data)) ?? VersionInfo()
    }

    private func saveVersionInfo() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted]

        guard let data = try? encoder.encode(versionInfo) else { return }
        try? data.write(to: AppPaths.versionFile)
    }
}
