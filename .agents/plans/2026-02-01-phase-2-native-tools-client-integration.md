---
date: 2026-02-01
title: Phase 2 Native Tools Client Integration
directory: /Users/alioudiallo/code/src/github.com/aliou/pi-apps
project: Pi Apps
status: pending
dependencies: [phase-1-native-tools-extension-bridge]
dependents: []
---

# Phase 2: Native Tools Client Integration (iOS + macOS Remote)

## Goal/Overview

Wire native tools into the **native clients** (iOS + macOS remote mode) so they can:

1. Publish their available native tool definitions to the relay server via REST.
2. Receive native tool execution requests emitted by the sandbox extension as `extension_ui_request` with custom method `native_tool_call`.
3. Execute the native tool locally (Calendar/Location/Reminders/HealthKit/etc.).
4. Respond back to the sandbox using `extension_ui_response` including a **JSON object** result.

## Context / Constraints

- **Do not modify pi binary**.
- It is OK to evolve:
  - Relay REST API (custom layer)
  - Client-side decoding helpers in `packages/pi-core/Sources/PiCore/Models/*` and `packages/pi-core/Sources/PiCore/Relay/*`

## Approaches Discussed

### Accepted

- Use `extension_ui_request` + `extension_ui_response` to transport native tool calls.
- Use a custom method string: `native_tool_call`.
- Publish tool definitions via REST to avoid changing the session WebSocket proxy.
- **Send on create + refresh on connect**:
  - Include `nativeTools` in `POST /api/sessions` when creating a session.
  - Call `PUT /api/sessions/:id/native-tools` on every connect/reconnect to refresh device-specific availability.

### Rejected

- Using only built-in extension UI methods (confirm/select/input/editor): cannot represent tool execution cleanly.
- Sending tool definitions over the session WebSocket as a new command: considered "new protocol"; use REST instead.

## Dependencies

- Phase 1 implemented:
  - Relay session create supports optional `nativeTools` in `POST /api/sessions` (send-on-create)
  - Relay REST endpoint: `PUT /api/sessions/:id/native-tools` (refresh-on-connect)
  - Sandbox mounts and extension enabled in Docker
  - WS allow-list includes `extension_ui_response`

## File Structure

### Modified files (Swift)

1. Add REST client support for native tools endpoint
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Relay/RelayAPIClient.swift`
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Relay/RelayTypes.swift`

2. Make `ExtensionUIRequest` decoding accept custom methods and extra fields
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Models/RPCTypes.swift`
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Models/DebugEvent.swift`

3. Update native tool types and transport
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Models/NativeToolTypes.swift`
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/packages/pi-core/Sources/PiCore/Relay/RelaySessionTransport.swift`

4. Teach iOS client to respond to `native_tool_call`
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/apps/mobile/Sources/Services/ServerConnection.swift`

5. Teach macOS (remote mode) client to respond to `native_tool_call`
   - `/Users/alioudiallo/code/src/github.com/aliou/pi-apps/apps/desktop/Sources/Services/ServerConnection.swift`

## Component Breakdown

### Cleanup: Remove Old Native Tool Protocol

Before implementing new features, remove the old protocol to avoid conflicts and confusion.

#### Cleanup 1) Remove from RelaySessionTransport

In `/packages/pi-core/Sources/PiCore/Relay/RelaySessionTransport.swift`:
- Remove the `nativeToolResponse(toolCallId:result:isError:id:)` method entirely.

#### Cleanup 2) Remove from RPCEvent

In `/packages/pi-core/Sources/PiCore/Models/RPCTypes.swift`, update the `RPCEvent` enum:
- Remove `.nativeToolRequest(NativeToolRequest)` case
- Remove `.nativeToolCancel(callId: String)` case
- Keep `.extensionUIRequest(ExtensionUIRequest)` case (this will handle native tool calls once `ExtensionUIMethod` supports `.custom(String)`)

#### Cleanup 3) Update NativeToolTypes

In `/packages/pi-core/Sources/PiCore/Models/NativeToolTypes.swift`:
- **KEEP** `NativeToolDefinition` — used for tool definitions sent to relay REST API.
- **KEEP** `NativeToolRequest` — used to construct from `ExtensionUIRequest` fields during native tool call handling (no longer a separate event type).
- **KEEP** `NativeToolErrorInfo` — useful for error envelope.
- **REMOVE** `NativeToolResponseParams` — replaced by `ExtensionUIResponseCommand` with `AnyCodable` value.

#### Cleanup 4) Remove parsing from RelaySessionTransport

In `/packages/pi-core/Sources/PiCore/Relay/RelaySessionTransport.swift`, update the `parsePiEvent()` method:
- Remove the `"native_tool_request"` decoding case
- Remove the `"native_tool_cancel"` decoding case
- Keep `"extension_ui_request"` case (it already decodes into `.extensionUIRequest(ExtensionUIRequest)`)

#### Cleanup 5) Update DebugEvent if needed

In `/packages/pi-core/Sources/PiCore/Models/DebugEvent.swift`:
- Check if it references `NativeToolRequest`, `NativeToolResponseParams`, `NativeToolRequestPayload`, or `NativeToolCancelPayload`.
- Remove or update any such references to use the new protocol.

#### Cleanup 6) Remove old handling from clients

In `/apps/mobile/Sources/Services/ServerConnection.swift` and `/apps/desktop/Sources/Services/ServerConnection.swift`:
- If there is any existing event handling for `.nativeToolRequest` or `.nativeToolCancel`, remove it.

### A) Relay REST client: send-on-create + refresh-on-connect

#### A1) Send on create (extend session creation params)

Update session creation request type:

- Swift: `CreateSessionParams` in `/packages/pi-core/Sources/PiCore/Relay/RelayTypes.swift`

Add optional field:

```swift
public struct CreateSessionParams: Encodable, Sendable {
    public let mode: SessionMode
    public let repoId: String?
    public let modelProvider: String?
    public let modelId: String?
    public let systemPrompt: String?
    public let sandboxProvider: String?
    public let nativeTools: [NativeToolDefinition]?
}
```

Behavior:
- When the app creates a session, it includes the current device's `availableDefinitions`.
- This lets the relay write `tools.json` before sandbox provisioning, so the extension can register tools immediately.

#### A2) Refresh on connect

Add types in `/packages/pi-core/Sources/PiCore/Relay/RelayTypes.swift`:

```swift
public struct SetNativeToolsParams: Encodable, Sendable {
    public let tools: [NativeToolDefinition]
}

public struct SetNativeToolsResponse: Decodable, Sendable {
    public let count: Int
}
```

Add API method in `/packages/pi-core/Sources/PiCore/Relay/RelayAPIClient.swift`:

```swift
public func setNativeTools(sessionId: String, tools: [NativeToolDefinition]) async throws -> SetNativeToolsResponse
```

HTTP:
- `PUT /api/sessions/:id/native-tools`
- body: `{ "tools": [...] }`

Client rule:
- Call this on every connect/reconnect to reflect permission changes and device differences.

### B) Swift decoding: allow custom Extension UI requests

Problem:
- Current code in `/packages/pi-core/Sources/PiCore/Models/RPCTypes.swift` defines:
  - `ExtensionUIMethod: enum` with fixed cases
  - `ExtensionUIRequest.method: ExtensionUIMethod`

This **fails decoding** for custom method strings like `native_tool_call`.

Fix (client-side only, does not change protocol):

1) Replace `ExtensionUIMethod` with a custom-codable enum:

```swift
public enum ExtensionUIMethod: Codable, Sendable, Equatable {
    case select, confirm, input, editor
    case notify, setStatus, setWidget, setTitle
    case set_editor_text
    case custom(String)

    public var rawValue: String {
        switch self {
        case .select: return "select"
        case .confirm: return "confirm"
        case .input: return "input"
        case .editor: return "editor"
        case .notify: return "notify"
        case .setStatus: return "setStatus"
        case .setWidget: return "setWidget"
        case .setTitle: return "setTitle"
        case .set_editor_text: return "set_editor_text"
        case .custom(let s): return s
        }
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let s = try container.decode(String.self)
        switch s {
        case "select": self = .select
        case "confirm": self = .confirm
        case "input": self = .input
        case "editor": self = .editor
        case "notify": self = .notify
        case "setStatus": self = .setStatus
        case "setWidget": self = .setWidget
        case "setTitle": self = .setTitle
        case "set_editor_text": self = .set_editor_text
        default: self = .custom(s)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}
```

2) Extend `ExtensionUIRequest` struct to include optional fields used by native tool calls:

```swift
public struct ExtensionUIRequest: Codable, Sendable {
    public let id: String
    public let method: ExtensionUIMethod
    public let timeout: Int?

    // existing fields ...

    // native tool bridge fields (ignored for standard methods)
    public let toolName: String?
    public let args: AnyCodable?
}
```

This allows decoding both standard extension UI requests and our native tool calls.

### C) Sending `extension_ui_response` with JSON object value

User decision: **use JSON object**, not JSON string.

That implies the client must send:

```json
{
  "type": "extension_ui_response",
  "id": "toolu_...",
  "value": { "ok": true, "result": { ... } }
}
```

Swift currently models response command as:

```swift
public struct ExtensionUIResponseCommand: RPCCommand, Sendable {
    public let type = "extension_ui_response"
    public let id: String
    public let value: String?
    public let confirmed: Bool?
    public let cancelled: Bool?
}
```

Update it to support JSON object values:

```swift
public struct ExtensionUIResponseCommand: RPCCommand, Sendable {
    public let type = "extension_ui_response"
    public let id: String
    public let value: AnyCodable?
    public let confirmed: Bool?
    public let cancelled: Bool?
}
```

Then update the transport helper to match. In `/packages/pi-core/Sources/PiCore/Relay/RelaySessionTransport.swift`:

Update `extensionUIResponse(...)` signature to accept `Any?`:

```swift
public func extensionUIResponse(
    requestId: String,
    value: Any? = nil,
    confirmed: Bool? = nil,
    cancelled: Bool? = nil
) async throws
```

The implementation should:
- Build a `[String: Any]` dict with the parameters
- Use `JSONSerialization` to encode the `value` parameter as a JSON object (if provided)
- Send via the WS transport

This replaces the old string-only approach, and deprecates the removed `nativeToolResponse()` method.

### D) iOS: publish tools + handle native tool calls

The mobile app already has:
- `NativeTool.swift` and `NativeToolExecutor.swift` in `/apps/mobile/Sources/NativeTools/`
- Complete tool implementations for Calendar, Location, Reminders, HealthKit, etc.

#### Publish tools

In `/apps/mobile/Sources/Services/ServerConnection.swift`:

After `agentConnection.connect()` succeeds (e.g., in `connectToSession(_:)`), call:

```swift
let tools = NativeTool.availableDefinitions
try await api.setNativeTools(sessionId: session.id, tools: tools)
```

Call this on every connect/reconnect to ensure relay file is up to date.

#### Handle tool calls

In `startEventForwarding()` (or equivalent event loop in `ServerConnection.swift`), add case:

```swift
case .extensionUIRequest(let request):
    Task { await self.handleExtensionUIRequest(request) }
```

Implement handler:

```swift
private func handleExtensionUIRequest(_ request: ExtensionUIRequest) async {
    // Only handle our custom method
    guard case .custom("native_tool_call") = request.method else {
        return
    }

    guard let toolName = request.toolName else {
        try? await agentConnection?.sendExtensionUIError(id: request.id, message: "Missing toolName")
        return
    }

    // Extract args; args is AnyCodable? so convert to dict
    var argsDict: [String: AnyCodable] = [:]
    if let args = request.args {
        // If args was sent as an object, extract it
        // (Implementation depends on your AnyCodable; typically you'd pattern-match or use as-is)
        argsDict = extractArgsDict(args)
    }

    let nativeRequest = NativeToolRequest(callId: request.id, toolName: toolName, args: argsDict)

    do {
        let resultData = try await nativeToolExecutor.execute(request: nativeRequest)
        let resultObject = try JSONSerialization.jsonObject(with: resultData)
        let responseValue: [String: Any] = ["ok": true, "result": resultObject]
        try await agentConnection?.extensionUIResponse(id: request.id, value: responseValue)
    } catch {
        let errorValue: [String: Any] = [
            "ok": false,
            "error": ["message": error.localizedDescription]
        ]
        try? await agentConnection?.extensionUIResponse(id: request.id, value: errorValue)
    }
}
```

Helper (if needed):

```swift
private func extractArgsDict(_ value: AnyCodable) -> [String: AnyCodable] {
    // Convert AnyCodable to dict; adjust based on actual AnyCodable implementation
    if case .dictionary(let dict) = value {
        return dict
    }
    return [:]
}
```

### E) macOS (remote mode): publish tools + handle calls

Mirror the same changes in `/apps/desktop/Sources/Services/ServerConnection.swift`.

#### Publish tools

Use desktop tool definitions (same as iOS, but may differ by platform):

```swift
let tools = NativeTool.availableDefinitions
try await api.setNativeTools(sessionId: session.id, tools: tools)
```

#### Handle tool calls

Add the same event handler for `.extensionUIRequest` and implement `handleExtensionUIRequest(_:)` using the desktop `NativeToolExecutor` and tool implementations.

## Integration Points

- The relay server WebSocket must forward `extension_ui_response` to sandbox stdin. Phase 1 makes it a valid `ClientCommand`.
- The sandbox extension must emit `extension_ui_request` with extra fields toolName/args. Phase 1 implements.
- Clients must be tolerant to other extension UI events (`notify`, `setWidget`, etc.).

## Implementation Order (Phase 2)

- [ ] Clean up old native tool protocol
  - [ ] Remove `nativeToolResponse()` from `RelaySessionTransport.swift`
  - [ ] Remove `.nativeToolRequest` and `.nativeToolCancel` cases from `RPCEvent` enum in `RPCTypes.swift`
  - [ ] Remove `NativeToolResponseParams` from `NativeToolTypes.swift`
  - [ ] Remove `"native_tool_request"` and `"native_tool_cancel"` parsing cases from `parsePiEvent()` in `RelaySessionTransport.swift`
  - [ ] Update `DebugEvent.swift` if it references removed types
  - [ ] Remove any old native tool event handling from `/apps/mobile/Sources/Services/ServerConnection.swift` and `/apps/desktop/Sources/Services/ServerConnection.swift`

- [ ] Add relay REST client support in PiCore
  - [ ] Extend `CreateSessionParams` to include optional `nativeTools: [NativeToolDefinition]?` in `RelayTypes.swift` (send-on-create)
  - [ ] Add request/response types for refresh endpoint in `RelayTypes.swift`
  - [ ] Add `setNativeTools(sessionId:tools:)` in `RelayAPIClient.swift`

- [ ] Make `ExtensionUIRequest` decoding extensible
  - [ ] Replace `ExtensionUIMethod` with custom-codable enum supporting `.custom(String)` in `RPCTypes.swift`
  - [ ] Add optional `toolName: String?` and `args: AnyCodable?` to `ExtensionUIRequest` in `RPCTypes.swift`
  - [ ] Update debug formatting sites:
    - `/packages/pi-core/Sources/PiCore/Models/DebugEvent.swift`

- [ ] Add ability to send `extension_ui_response` with JSON object value
  - [ ] Update `ExtensionUIResponseCommand.value` type from `String?` to `AnyCodable?` in `RPCTypes.swift`
  - [ ] Update `RelaySessionTransport.extensionUIResponse()` helper to accept `value: Any?` and encode as JSON object

- [ ] iOS app integration
  - [ ] On session creation (REST): include `nativeTools: NativeTool.availableDefinitions` in `CreateSessionParams`
  - [ ] On session connect/reconnect: call `api.setNativeTools(sessionId:tools:)` to refresh
  - [ ] Handle `RPCEvent.extensionUIRequest` when method is `.custom("native_tool_call")`
  - [ ] Extract `toolName` and `args` from request
  - [ ] Execute native tool via `NativeToolExecutor` and `NativeToolRequest`
  - [ ] Respond via `extensionUIResponse()` with envelope object `{ ok: true/false, result/error: ... }`

- [ ] macOS app integration (remote mode)
  - [ ] On session creation (REST): include `nativeTools: NativeTool.availableDefinitions`
  - [ ] On session connect/reconnect: call `api.setNativeTools(sessionId:tools:)` to refresh
  - [ ] Same handling for `.custom("native_tool_call")`, using desktop `NativeToolExecutor`

## Error Handling / Edge Cases

- If client receives `native_tool_call` but tool is missing (because device/tool list shrank):
  - Respond `{ ok: false, error: { message: "Tool not available on this device/session" } }`.

Note:
- Phase 2 implements **soft-disable** semantics for "tool list shrank" cases.
- If/when sandboxes restart naturally (idle shutdown or third-party lifecycle), the extension will re-register only what's in `tools.json`, so tool removals take effect automatically on next start.

- Permission errors:
  - Tools themselves are responsible for permission requests.
  - If denied, respond `{ ok: false, error: { message: "Permission denied" } }`.

- Client disconnect mid-tool:
  - Tool execution may continue; when it finishes, response send will fail.
  - Should cancel the in-flight tool on disconnect if possible.

- Multiple concurrent tool calls:
  - NativeToolExecutor must support concurrent calls; if not, serialize.

## Testing Strategy

### iOS simulator

1. Run relay server.
2. Create session.
3. Connect from iOS app.
4. Verify `PUT /api/sessions/:id/native-tools` is called (server logs).
5. Prompt LLM to call a tool, e.g. `get_device_info`.
6. Verify:
   - Sandbox stdout emits `extension_ui_request` with method `native_tool_call`.
   - Client executes tool via `NativeToolExecutor`.
   - Client sends `extension_ui_response` with `{ ok: true, result: ... }` object.
   - LLM receives tool output.

### macOS app remote mode

Repeat, using desktop native tool definitions.

## Decision Points

- Tool definitions transport: **REST** (avoid WS protocol changes), with **send-on-create + refresh-on-connect**.
- Response format: `extension_ui_response.value` is a **JSON object** (requires widening Swift type from `String?` to `AnyCodable?`).
- Scope: **remote clients (iOS + macOS)** in Phase 2.
- Cleanup first: Remove old protocol before implementing new features to avoid confusion and type conflicts.

## Future Enhancements

- Optional UI for built-in extension UI requests (confirm/select/input/editor) on mobile.
- Tool ownership model if multiple clients connect to same session.
- Rich result rendering standard (e.g. display envelopes already used by `display_chart`).
- Desktop native tools in a future phase (currently desktop sends empty `nativeTools: []`).

## Implementation Progress

- [ ] Not started
