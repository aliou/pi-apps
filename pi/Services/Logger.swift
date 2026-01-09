//
//  Logger.swift
//  pi
//
//  Simple file logger for debugging
//

import Foundation

enum LogLevel: String {
    case debug = "DEBUG"
    case info = "INFO"
    case warn = "WARN"
    case error = "ERROR"
}

actor Logger {
    static let shared = Logger()

    private let logFileURL: URL
    private let dateFormatter: DateFormatter
    private var fileHandle: FileHandle?

    private init() {
        // Log to Application Support logs directory
        let logDir = AppPaths.logsDirectory

        let timestamp = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
        logFileURL = logDir.appendingPathComponent("pi-\(timestamp).log")

        dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "HH:mm:ss.SSS"

        // Create or open log file
        if !FileManager.default.fileExists(atPath: logFileURL.path) {
            FileManager.default.createFile(atPath: logFileURL.path, contents: nil)
        }
        fileHandle = try? FileHandle(forWritingTo: logFileURL)
        fileHandle?.seekToEndOfFile()

        // Write header
        let header = "=== Pi Desktop Log Started ===\n"
        fileHandle?.write(header.data(using: .utf8) ?? Data())
    }

    func log(_ level: LogLevel, _ message: String, file: String = #file, line: Int = #line) {
        let fileName = (file as NSString).lastPathComponent
        let timestamp = dateFormatter.string(from: Date())
        let logLine = "[\(timestamp)] [\(level.rawValue)] [\(fileName):\(line)] \(message)\n"

        // Write to file
        if let data = logLine.data(using: .utf8) {
            fileHandle?.write(data)
        }

        // Also print errors to console
        if level == .error {
            print(logLine, terminator: "")
        }
    }

    func debug(_ message: String, file: String = #file, line: Int = #line) {
        log(.debug, message, file: file, line: line)
    }

    func info(_ message: String, file: String = #file, line: Int = #line) {
        log(.info, message, file: file, line: line)
    }

    func warn(_ message: String, file: String = #file, line: Int = #line) {
        log(.warn, message, file: file, line: line)
    }

    func error(_ message: String, file: String = #file, line: Int = #line) {
        log(.error, message, file: file, line: line)
    }

    var logFilePath: String {
        logFileURL.path
    }

    func flush() {
        try? fileHandle?.synchronize()
    }
}

// Convenience global functions
func logDebug(_ message: String, file: String = #file, line: Int = #line) {
    Task { await Logger.shared.debug(message, file: file, line: line) }
}

func logInfo(_ message: String, file: String = #file, line: Int = #line) {
    Task { await Logger.shared.info(message, file: file, line: line) }
}

func logWarn(_ message: String, file: String = #file, line: Int = #line) {
    Task { await Logger.shared.warn(message, file: file, line: line) }
}

func logError(_ message: String, file: String = #file, line: Int = #line) {
    Task { await Logger.shared.error(message, file: file, line: line) }
}
