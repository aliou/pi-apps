//
//  ToolCallStatus.swift
//  PiCore
//
//  Status of a tool call execution
//

import Foundation

public enum ToolCallStatus: Sendable, Hashable {
    case running
    case success
    case error
}
