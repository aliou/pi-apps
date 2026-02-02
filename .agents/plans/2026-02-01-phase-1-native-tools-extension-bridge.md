---
date: 2026-02-01
title: Phase 1 Native Tools Extension Bridge
directory: /Users/alioudiallo/code/src/github.com/aliou/pi-apps
project: Pi Apps
status: pending
dependencies: []
dependents: [phase-2-native-tools-client-integration]
---

# Phase 1: Native Tools Extension Bridge (Relay + Sandbox)

## Goal/Overview

Enable **native tools** (device capabilities like calendar/location/reminders/health) in remote sessions **without modifying the pi binary or upstream RPC protocol**.

We do this by:

1. Starting every sandboxed `pi --mode rpc` process with a **TypeScript extension** (`-e <path>`).
2. The extension registers tools inside pi based on a **tool definitions JSON file** mounted into the container.
3. When a registered native tool is invoked by the LLM, the extension emits an `extension_ui_request` with a **custom method** (`native_tool_call`).
4. Remote clients respond with `extension_ui_response` and the extension returns the result to pi.

This approach matches how pi RPC mode already transports extension UI events, but uses a custom method and extra fields.

## Verified Assumptions (from local tests)

These were validated with the test harness (see `tmp/test-native-bridge/` for the recorded scripts and `test-native-bridge/` in repo):

- pi in RPC mode forwards `extension_ui_request` events to stdout.
- A client can send `extension_ui_response` back on stdin.
- **Custom** `extension_ui_request.method` values (e.g. `native_tool_call`) are delivered to the client.
- The extension can correlate responses by `id`.

## Approaches Discussed (accepted + rejected)

### Accepted

- **Pi extension-based bridge**: use `-e native-bridge.ts` and `extension_ui_request`/`extension_ui_response` to round-trip native tool execution.
  - Rationale: avoids any pi modification; uses existing transport; keeps the agent runtime in Docker.

### Rejected

- **Modify pi RPC protocol / add new RPC event types in pi**
  - Rejected due to explicit constraint: pi binary/RPC protocol is upstream-owned.

- **Custom stdout/stdin line protocol** (e.g. `NATIVE_TOOL_CALL|{json}`)
  - Rejected because `extension_ui_request`/`extension_ui_response` already exists in pi and is cleaner.

- **Defining tools in relay-server**
  - Rejected: tool definitions must remain client-owned (mobile/desktop), server only stores/transports.

## Dependencies

### Runtime
- Docker images already contain pi:
  - `dockerfiles/sandbox-codex-universal/Dockerfile`
  - `dockerfiles/sandbox-alpine-arm64/Dockerfile`
- No extra OS packages needed.

### Node/TS
- Extension runs as TypeScript via pi's extension loader (validated in tests).
- Use no new npm dependencies if possible; if needed, keep to what pi runtime already bundles.

## File Structure

### New files

1. **Native bridge extension**
   - `apps/relay-server/extensions/native-bridge.ts`

2. **Native tools REST route**
   - `apps/relay-server/src/routes/native-tools.ts`

3. **Native tools manager/service**
   - `apps/relay-server/src/services/native-tools.service.ts`

### Modified files

1. Docker sandbox creation (mount extension + native tools file, run pi with `-e`)
   - `apps/relay-server/src/sandbox/docker.ts`
   - Update `CreateSandboxOptions` in `apps/relay-server/src/sandbox/types.ts` to add optional `nativeToolsDir?: string` and `extensionPaths?: string[]`

2. Sessions route (accept `nativeTools` on create)
   - `apps/relay-server/src/routes/sessions.ts`

3. Hono app wiring (mount REST route)
   - `apps/relay-server/src/app.ts`

4. WebSocket proxy: remove old protocol leftovers and allow extension UI responses
   - `apps/relay-server/src/ws/types.ts`
   - Remove `native_tool_response` from ClientCommand union and CLIENT_COMMAND_TYPES
   - Remove `native_tool_request` from PiEvent
   - Add `extension_ui_response` to ClientCommand and CLIENT_COMMAND_TYPES

5. Mock sandbox: update to handle new protocol
   - `apps/relay-server/src/sandbox/mock.ts`
   - Remove `native_tool_response` handler (or replace with `extension_ui_response`)

6. Relay server API types for clients (Swift mirror)
   - `packages/pi-core/Sources/PiCore/Relay/RelayTypes.swift`
   - `packages/pi-core/Sources/PiCore/Relay/RelayAPIClient.swift`

## Component Breakdown

### A) `native-bridge.ts` (pi extension)

**Location:** `apps/relay-server/extensions/native-bridge.ts` (new directory, created as part of this phase)

**Responsibilities**
- Read tool definitions from a mounted JSON file (`/run/native-tools/tools.json`).
- Register tools with pi via `pi.registerTool()`.
- For each tool call, emit a custom extension UI request:
  - `type: "extension_ui_request"`
  - `id: <toolCallId>` (use the pi toolCallId for correlation)
  - `method: "native_tool_call"`
  - `toolName`, `args`
- Wait for `extension_ui_response` with matching `id`.
- Validated approach: use `ctx.ui.custom()` or the raw emit pattern (see `test-native-bridge/` directory for reference implementation).

**Data format**

Request emitted by extension:
```json
{
  "type": "extension_ui_request",
  "id": "toolu_...",
  "method": "native_tool_call",
  "toolName": "get_calendar_events",
  "args": {"start":"2026-02-01","end":"2026-02-01"},
  "timeout": 60000
}
```

Response expected from client:
```json
{
  "type": "extension_ui_response",
  "id": "toolu_...",
  "value": {
    "ok": true,
    "result": {"events": []}
  }
}
```

Error response (standardize this):
```json
{
  "type": "extension_ui_response",
  "id": "toolu_...",
  "value": {
    "ok": false,
    "error": {"message": "Permission denied"}
  }
}
```

Cancelled response:
```json
{ "type": "extension_ui_response", "id": "toolu_...", "cancelled": true }
```

**Implementation sketch**

- Maintain a `Map<string, {resolve,reject,timeout}>` keyed by request id.
- Create a single stdin line reader (do not create one per call).
- Only write JSON requests to **stdout**.
- All debug logs must go to **stderr** (`console.error`) to avoid breaking JSONL.

Signatures:
```ts
interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema-ish
}

interface NativeToolResultEnvelope {
  ok: boolean;
  result?: unknown;
  error?: { message: string; code?: string };
}
```

Registration:
```ts
export default async function (pi: ExtensionAPI) {
  const tools = await loadToolsFromFile(process.env.PI_NATIVE_TOOLS_FILE);
  for (const tool of tools) {
    pi.registerTool({
      name: tool.name,
      description: tool.description,
      // NOTE: Use a safe schema approach (TypeBox Type.Unsafe or Type.Any)
      parameters: toTypeBox(tool.parameters),
      async execute(toolCallId, params, onUpdate, ctx, signal) {
        const envelope = await nativeToolCall(toolCallId, tool.name, params, signal);
        if (!envelope.ok) throw new Error(envelope.error?.message ?? "Native tool failed");
        return {
          content: [{ type: "text", text: JSON.stringify(envelope.result, null, 2) }],
          details: envelope.result
        };
      }
    });
  }
}
```

**Tool definitions loading**

- Read from `PI_NATIVE_TOOLS_FILE` (default `/run/native-tools/tools.json`).
- Watch for changes (`fs.watchFile`) and register newly added tools.
  - Do not attempt to unregister tools (pi doesn't support it reliably).
  - Track `registeredToolNames: Set<string>`.

### B) Relay-server: native tools file mount + extension mount

**Location:** 
- Docker provider: `apps/relay-server/src/sandbox/docker.ts`
- Sandbox types: `apps/relay-server/src/sandbox/types.ts`

**Updates needed:**

1. **Extend `CreateSandboxOptions` interface:**
   - Add optional `nativeToolsDir?: string` (path to per-session native tools directory)
   - Add optional `extensionPaths?: string[]` (paths to extension files to mount)

2. **In `DockerSandboxProvider.createSandbox()`:**
   - Bind mount the extension file into the container read-only.
   - Bind mount the per-session native tools directory into the container read-only.
     - Host can still update the file; container sees updates.
   - Override `Cmd` to run pi with the extension:

```ts
Cmd: ["pi", "--mode", "rpc", "-e", "/run/extensions/native-bridge.ts"]
```

**Host paths**

- Extension host path (repo file):
  - Repository-relative: `apps/relay-server/extensions/native-bridge.ts`
  - During development: bind mount from relay-server's extensions directory.
  - In production: the extension should be baked into the Docker image.

- Native tools host file (per session, stored in session data dir):
  - `${sessionDataDir}/${sessionId}/native-tools/tools.json`

**Container paths**

- Extension: `/run/extensions/native-bridge.ts`
- Tools file: `/run/native-tools/tools.json`

**Env**

- `PI_NATIVE_TOOLS_FILE=/run/native-tools/tools.json`

### C) Relay-server: REST endpoints for native tool definitions

We avoid modifying the session WebSocket protocol.

We support **two REST flows** (explicit decision):

1. **Send on create**: client includes native tools in `POST /api/sessions` so the sandbox can register tools ASAP.
2. **Refresh on connect**: client calls `PUT /api/sessions/:id/native-tools` on every connect/reconnect to reflect current device permissions/capabilities.

#### C1) Send on create (extend sessions create)

Extend:

- `POST /api/sessions`

Request body (add optional field):
```json
{
  "mode": "chat",
  "nativeTools": [
    {"name":"get_calendar_events","description":"...","parameters":{...}}
  ]
}
```

Behavior:
- Create session record as today.
- If `nativeTools` present, write it immediately to the per-session `tools.json` via `NativeToolsService` **before** starting sandbox provisioning.

This minimizes race where the first prompt arrives before tools are registered.

#### C2) Refresh on connect

Add endpoint:

- `PUT /api/sessions/:id/native-tools`

Request body:
```json
{ "tools": [ {"name":"...","description":"...","parameters":{...}} ] }
```

Behavior:
- Validate session exists and isn't deleted.
- Write `tools.json` to that session's native tools host dir: `${sessionDataDir}/${sessionId}/native-tools/tools.json`.
- Return `{ data: { count: number }, error: null }`.

Implementation details:
- Introduce `NativeToolsService` to:
  - Create per-session native tools directory at `${sessionDataDir}/${sessionId}/native-tools/` (co-located with session data, not separate base dir).
  - Write JSON atomically:
    - write to `tools.json.tmp` then rename.

Note (tool removal semantics + sandbox lifecycle):
- In pi-mono, extensions can `registerTool()` but there is **no runtime `unregisterTool()` API**; tools disappear only on a **full extension reload / process restart**.
- pi RPC mode currently exposes **no reload command**, so within a running sandbox we should assume we can only **add** tools at runtime.
- When tool availability shrinks (permissions revoked, different device, reconnect with fewer tools), implement **soft-disable**: keep the tool registered but return `{ok:false}` / error when the latest `tools.json` no longer lists that tool.
- If sandboxes are short-lived (e.g. third-party providers, or our own idle shutdown), then **hard removal happens naturally on next start** because the extension re-reads `tools.json` and only registers what is present.
- If we require hard removal *without* relying on process restarts, that implies restarting pi/sandbox and persisting session state (see Future Enhancements).

### D) Relay-server: WebSocket command allow-list fixes

**Location:** `apps/relay-server/src/ws/types.ts`

**Cleanup (remove old protocol leftovers):**

- Remove `native_tool_response` from `ClientCommand` union
- Remove `native_tool_response` from `CLIENT_COMMAND_TYPES` set
- Remove `native_tool_request` from `PiEvent` union

**Add support for standard pi command:**

- client -> server command: `extension_ui_response`

This is required so remote clients can answer extension UI prompts.

Update:
- `ClientCommand` union: add `{ type: "extension_ui_response"; id: string; value?: unknown; confirmed?: boolean; cancelled?: boolean }`
- `CLIENT_COMMAND_TYPES` set: include `extension_ui_response`

## Integration Points

- Docker images run pi via `CMD ["pi", "--mode", "rpc"]` (see `dockerfiles/sandbox-codex-universal/Dockerfile` and `dockerfiles/sandbox-alpine-arm64/Dockerfile`).
  - Phase 1 overrides this command at container creation time to: `["pi", "--mode", "rpc", "-e", "/run/extensions/native-bridge.ts"]`.
  - Note: `--no-session` should not be included in the override; the default behavior is desired.

- Relay WebSocket is intended as a proxy. We only adjust allow-list to include valid pi commands.

## Implementation Order (Phase 1)

- [ ] **Clean up old native_tool_* protocol leftovers**
  - [ ] Remove `native_tool_response` from `ClientCommand` union in `apps/relay-server/src/ws/types.ts`
  - [ ] Remove `native_tool_response` from `CLIENT_COMMAND_TYPES` set in `apps/relay-server/src/ws/types.ts`
  - [ ] Remove `native_tool_request` from `PiEvent` union in `apps/relay-server/src/ws/types.ts`
  - [ ] Update or remove `native_tool_response` handler in `apps/relay-server/src/sandbox/mock.ts`

- [ ] Create `apps/relay-server/extensions/native-bridge.ts`
  - [ ] Load tools from `PI_NATIVE_TOOLS_FILE` (default `/run/native-tools/tools.json`).
  - [ ] Watch file and register tools once available.
  - [ ] Implement `native_tool_call` request/response correlation.
  - [ ] Ensure only JSON goes to stdout; logs to stderr.

- [ ] Extend sandbox types and implement per-session native tools directory in docker provider
  - [ ] Update `CreateSandboxOptions` interface in `apps/relay-server/src/sandbox/types.ts`
    - [ ] Add optional `nativeToolsDir?: string`
    - [ ] Add optional `extensionPaths?: string[]`
  - [ ] Update `DockerSandboxProvider.createSandbox()` in `apps/relay-server/src/sandbox/docker.ts`
    - [ ] Create per-session native tools dir at `${sessionDataDir}/${sessionId}/native-tools/` with initial `tools.json` = `[]`
    - [ ] Bind mount extension file to `/run/extensions/native-bridge.ts:ro`
    - [ ] Bind mount native tools file to `/run/native-tools/tools.json:ro`
    - [ ] Set env var `PI_NATIVE_TOOLS_FILE=/run/native-tools/tools.json`
    - [ ] Override container Cmd to: `["pi", "--mode", "rpc", "-e", "/run/extensions/native-bridge.ts"]`

- [ ] Add REST routes + service to write tool definitions
  - [ ] Implement `NativeToolsService` in `apps/relay-server/src/services/native-tools.service.ts`
    - [ ] Provide method to write tools JSON to session-specific location
    - [ ] Atomic write with temp file pattern
  - [ ] Add `PUT /api/sessions/:id/native-tools` endpoint
    - [ ] `apps/relay-server/src/routes/native-tools.ts`
    - [ ] Wire in `apps/relay-server/src/app.ts`
  - [ ] Extend `POST /api/sessions` to accept optional `nativeTools`
    - [ ] Update `CreateSessionRequest` interface in `apps/relay-server/src/routes/sessions.ts`
    - [ ] On create, if `nativeTools` present: call `NativeToolsService.set(sessionId, tools)` **before** `sandboxManager.createForSession(...)`

- [ ] Update WebSocket command allow-list
  - [ ] Add `extension_ui_response` to `ClientCommand` union in `apps/relay-server/src/ws/types.ts`
  - [ ] Add `extension_ui_response` to `CLIENT_COMMAND_TYPES` set in `apps/relay-server/src/ws/types.ts`

## Error Handling

- Extension:
  - If tool definitions file missing/invalid JSON: log to stderr, keep polling.
  - If tool registration fails: emit `extension_error`? (optional) and continue.
  - If a tool call times out waiting for response: throw error to pi.
  - If response envelope is `{ok:false}`: throw error with message.

- Relay REST:
  - Invalid JSON body -> 400
  - Unknown session -> 404
  - Session deleted -> 410
  - Write failure -> 500

- Docker:
  - Ensure native tools base dir is Docker-accessible (macOS Docker Desktop/Lima caveat).

## Testing Strategy

### Unit-ish
- Add a small Node test (similar to `test-native-bridge/run-test.mjs`) that:
  - Spawns pi with `native-bridge.ts`.
  - Writes a sample tools file.
  - Prompts pi to call a tool.
  - Fakes `extension_ui_response` and asserts tool returns.

### Integration
- Start relay-server and create a session **with native tools included**:
  - `POST /api/sessions` with `nativeTools: [...]`.
- Connect via WebSocket and prompt to invoke that tool.
- Then test refresh path:
  - Call `PUT /api/sessions/:id/native-tools` with an updated tool list.
  - Confirm the extension registers any newly added tools.
- Ensure tool call results stream back.

## Decision Points / Notes

- We intentionally use REST for tool definition updates (send-on-create + refresh-on-connect) to avoid modifying the WS proxy protocol.
- Custom method `native_tool_call` is required; built-in extension UI methods cannot carry this functionality cleanly.
- Swift clients currently decode `extension_ui_request.method` as a closed enum; Phase 2 must make it extensible.

## Future Enhancements

- Per-connection native tools (instead of per-session file) using a tool host concept.
- **Sandbox idle shutdown**:
  - Add an idle reaper in relay-server that stops sandboxes with no WS clients and no activity after N minutes.
  - On next connect, sandbox restarts and extension reads the latest `tools.json` (tool removals take effect naturally).
- **Hard tool removal while preserving conversation**:
  - Requires restarting pi / sandbox.
  - To preserve conversation state across restarts, mount a per-session `PI_CODING_AGENT_DIR` volume so pi persists sessions (already the default behavior without `--no-session`).
- Cancellation propagation (abort -> notify client to cancel active native tool call).
- Bake extension file into Docker image for production to avoid build-time file mounts.

## Implementation Progress

- [ ] Not started
