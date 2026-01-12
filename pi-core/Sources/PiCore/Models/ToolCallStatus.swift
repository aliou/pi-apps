//
//  ToolCallStatus.swift
//  PiCore
//

import Foundation

/// Status of a tool call execution
public enum ToolCallStatus: Sendable {
    case running
    case success
    case error
}
