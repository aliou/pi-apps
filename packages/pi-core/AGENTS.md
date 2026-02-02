# PiCore Package

Foundation-only Swift package containing RPC types and relay client.

## Directory Structure

```
Sources/PiCore/
├── RPC/              # RPC protocol types (READ-ONLY MIRROR)
│   ├── AgentEvent.swift
│   ├── ClientCommand.swift
│   ├── Message.swift
│   ├── ToolCall.swift
│   └── ...
├── Relay/            # Relay API types (CAN MODIFY)
│   ├── RelayAPIClient.swift
│   ├── RelayTypes.swift
│   └── ...
└── Transport/        # Connection handling
    └── ...
```

## RPC Types (READ-ONLY)

The `RPC/` directory contains Swift types that mirror the pi-coding-agent RPC protocol exactly.

**Source of truth:** `@anthropic/pi-coding-agent` package in the [pi-mono](https://github.com/badlogic/pi-mono) repository.

**Rules:**
- NEVER add new types to `RPC/`
- NEVER modify existing RPC type shapes
- NEVER rename RPC type properties
- If upstream changes, update our types to match exactly

**Why:** The RPC protocol defines how the pi agent communicates. Our Swift types must decode the exact JSON the agent emits. Any mismatch causes runtime decode failures.

**Upstream locations to check:**
- `packages/pi-coding-agent/src/agent/events.ts` - Agent events
- `packages/pi-coding-agent/src/agent/commands.ts` - Client commands
- `packages/pi-coding-agent/src/types.ts` - Shared types

## Relay Types (CAN MODIFY)

The `Relay/` directory contains types for our custom REST API. These are NOT part of the RPC protocol.

**Rules:**
- Add new types as needed for REST endpoints
- Keep property names matching the JSON from relay-server (server sends camelCase)
- Update when relay-server REST responses change

**Examples of Relay types:**
- `RelaySession` - Session metadata from `/api/sessions`
- `Environment` - Environment config from `/api/environments`
- `RepoInfo` - Repository info from `/api/github/repos`
- `CreateSessionParams` - Request body for `POST /api/sessions`

## Adding New REST Types

When the relay-server adds a new endpoint:

1. Add response/request types to `RelayTypes.swift`
2. Add API method to `RelayAPIClient.swift`
3. Follow existing patterns:

```swift
// In RelayTypes.swift
public struct NewThing: Decodable, Sendable {
    public let id: String
    public let name: String
    // ...
}

// In RelayAPIClient.swift
public func listNewThings() async throws -> [NewThing] {
    let response: RelayResponse<[NewThing]> = try await get("/api/new-things")
    guard let data = response.data else {
        throw RelayAPIError.serverError(response.error ?? "No data")
    }
    return data
}
```

## JSON Decoding

The `RelayAPIClient` uses:
```swift
decoder.keyDecodingStrategy = .convertFromSnakeCase
```

So Swift `camelCase` properties automatically decode from JSON `snake_case`:
- `sandboxType` ← `sandbox_type`
- `isDefault` ← `is_default`
- `createdAt` ← `created_at`

## Package Dependencies

This package uses **Foundation only** - no SwiftUI, no UIKit. It must compile for both macOS and iOS.

Do not add dependencies that require platform-specific frameworks.
