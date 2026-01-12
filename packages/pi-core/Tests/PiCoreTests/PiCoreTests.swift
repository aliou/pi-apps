//
//  PiCoreTests.swift
//  PiCoreTests
//

import Testing
@testable import PiCore

@Test func rpcTypesExist() async throws {
    // Basic sanity check that types are accessible
    let command = AbortCommand()
    #expect(command.type == "abort")
}

@Test func toolCallStatusValues() async throws {
    let running = ToolCallStatus.running
    let success = ToolCallStatus.success
    let error = ToolCallStatus.error

    // Just verify the enum cases exist
    #expect(running != success)
    #expect(success != error)
}
