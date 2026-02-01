//
//  PiConnection.swift
//  pi
//
//  Unified interface for local subprocess and remote connections
//

import Foundation
import PiCore

/// Unified interface for local and remote connections
/// This extends AgentConnection with additional methods specific to the desktop app
@MainActor
public protocol PiConnection: AgentConnection {
    // AgentConnection provides:
    // - isConnected
    // - connect()
    // - disconnect()
    // - subscribe()
    // - prompt()
    // - abort()
    // - getState()
    // - getAvailableModels()
    // - setModel()
    // - getMessages()
}
