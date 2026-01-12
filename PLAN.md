---
date: 2025-01-12
title: Pi Core WebSocket Transport
directory: /Users/alioudiallo/code/src/github.com/aliou/pi-apps
project: pi-apps
---

# Pi Core WebSocket Transport Implementation Plan

## Goal/Overview

Implement a WebSocket-based communication layer in the `pi-core` Swift package that enables:

1. **iOS mobile app** to connect to a remote pi server (iOS cannot spawn subprocesses)
2. **Desktop app** to optionally connect to a remote server instead of local subprocess
3. **Shared abstractions** so both desktop and mobile apps use the same RPC logic

Currently, the desktop app spawns `pi --mode rpc` as a subprocess and communicates via JSONL over stdin/stdout. This plan creates a transport abstraction layer with two implementations:
- `SubprocessTransport` - wraps existing stdin/stdout behavior (desktop local)
- `WebSocketTransport` - connects to a remote server (iOS + desktop remote)

The server implementation is **out of scope** - this plan only covers the client-side pi-core package.

## Dependencies

**No new external dependencies required.**

- Uses native `URLSessionWebSocketTask` (iOS 13+ / macOS 10.15+)
- Uses Foundation's `Process` for subprocess (existing)
- All implementations use Swift 6 concurrency (async/await, actors)

## File Structure

```
packages/pi-core/Sources/PiCore/
├── Models/
│   ├── RPCTypes.swift                    # MODIFIED - added envelope types
│   └── ToolCallStatus.swift              # unchanged
├── Transport/
│   ├── RPCTransport.swift                # MODIFIED - enhanced protocol
│   ├── RPCConnection.swift               # NEW - shared RPC logic
│   ├── SubprocessTransport.swift         # NEW - stdin/stdout transport
│   ├── WebSocketTransport.swift          # NEW - WebSocket transport
│   └── ConnectionState.swift             # NEW - reconnection state management
├── Extensions/
│   └── Color+Hex.swift                   # unchanged
├── Theme/
│   └── Theme.swift                       # unchanged
└── PiCore.swift                          # unchanged
```

## Implementation Order

### Phase 1: Protocol Types
- [x] Add envelope types to `RPCTypes.swift` (WSRequest, WSResponse, WSEvent, etc.)
- [x] Add session management types (SessionCreateResult, SessionInfo, etc.)
- [x] Add hello/resume types (HelloParams, HelloResult, ResumeInfo, etc.)

### Phase 2: Enhanced Transport Protocol
- [x] Update `RPCTransport` protocol with new signature
- [x] Add `TransportEvent` struct with sessionId and seq
- [x] Update `RPCTransportConfig` with new fields

### Phase 3: Shared Connection Logic
- [x] Create `RPCConnection.swift` actor
- [x] Implement pending request management
- [x] Implement event stream management
- [x] Implement message parsing (both new envelope and legacy JSONL)
- [x] Implement seq tracking for resume
- [x] Create `ConnectionState.swift` for reconnection state

### Phase 4: Subprocess Transport
- [x] Create `SubprocessTransport.swift`
- [x] Port existing subprocess management from desktop RPCClient
- [x] Adapt to use `RPCConnection` for shared logic
- [x] Handle legacy JSONL format

### Phase 5: WebSocket Transport
- [x] Create `WebSocketTransport.swift`
- [x] Implement URLSessionWebSocketTask connection
- [x] Implement hello/handshake flow
- [x] Implement resume/replay logic
- [x] Implement reconnection with exponential backoff

### Phase 6: Testing
- [x] Unit tests for RPCConnection message parsing
- [x] Unit tests for envelope encoding/decoding
- [ ] Integration test for SubprocessTransport (if pi binary available)
- [ ] Mock server tests for WebSocketTransport

## Implementation Progress

### Completed
- Phase 1: Added all protocol envelope types to RPCTypes.swift
  - WSRequest, WSResponse, WSEvent, WSIncomingMessage
  - HelloParams, HelloResult, ClientInfo, ServerInfo, ServerCapabilities
  - ResumeInfo for reconnection support
  - SessionCreateResult, SessionListResult, SessionInfo
  - Fixed AnyCodable to handle nested wrapping
  
- Phase 2: Updated RPCTransport protocol
  - Added `connectionId` property
  - Added `TransportEvent` struct with sessionId and seq
  - Updated `RPCTransportConfig` with executablePath and clientInfo
  - Added default implementations for legacy command interface
  
- Phase 3: Created shared connection logic
  - `RPCConnection.swift` actor with pending request management
  - Event stream management with AsyncStream
  - Message parsing for both envelope and legacy JSONL formats
  - Seq tracking per session for resume capability
  - `ConnectionState.swift` for reconnection state management
  
- Phase 4: Subprocess transport implementation
  - `SubprocessTransport.swift` with Process management
  - ANSI escape code stripping for stdout parsing
  - Integration with RPCConnection for shared logic
  - Legacy JSONL format support
  
- Phase 5: WebSocket transport implementation
  - `WebSocketTransport.swift` with URLSessionWebSocketTask
  - Hello/handshake flow with resume support
  - Automatic reconnection with exponential backoff
  - Event streaming via RPCConnection
  
- Phase 6: Unit tests
  - 24 unit tests for transport types and logic
  - All tests passing

- Desktop App Migration
  - Migrated `RPCClient` to use `SubprocessTransport` from pi-core
  - Removed duplicate subprocess management code
  - Event forwarding from TransportEvent to RPCEvent
  - Same public interface preserved for MainView compatibility

### In Progress
- None

### Blocked
- Integration tests require pi binary or mock server

---

## Error Handling

### Transport Errors
- `notConnected` - Operation attempted before connect() or after disconnect()
- `connectionFailed(reason)` - Initial connection failed
- `connectionLost(reason)` - Connection dropped unexpectedly
- `timeout` - Request timed out waiting for response
- `serverError(RPCError)` - Server returned an error

### Reconnection Behavior
- WebSocket: Automatic reconnect with exponential backoff (1s, 2s, 4s, 8s, 16s, cap at 30s)
- Max 5 reconnection attempts before giving up
- On reconnect, attempt resume with lastSeqBySession
- If resume fails, reset seq tracking and let client resync via get_state/get_messages

### Edge Cases
1. **Concurrent requests** - Use unique UUIDs for request IDs, maintain pending map
2. **Out-of-order responses** - Match by request ID, not arrival order
3. **Partial JSON** - Buffer incoming data, process only complete lines/messages
4. **Process crash (subprocess)** - Detect via termination handler, fail pending requests
5. **App backgrounding (iOS)** - WebSocket will disconnect, reconnect on foreground

## Future Enhancements

1. **Authentication** - Add bearer token support in hello params
2. **Idempotency for prompts** - Add clientPromptId field to dedupe retried prompts
3. **Cursor-based get_messages** - For efficient incremental loading
4. **Connection quality metrics** - Track latency, reconnection frequency
5. **Binary message support** - For large file transfers if needed
6. **Request timeout configuration** - Per-method timeout settings
7. **Multiple server support** - Fallback servers, load balancing
