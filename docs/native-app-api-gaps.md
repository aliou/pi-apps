# Native App API Coverage Gap Analysis

**Branch:** `native-apps-sync`  
**Date:** 2026-02-07  
**Comparison:** Swift PiCore package vs. Relay Server REST API + WebSocket RPC

This document identifies what the server supports that the native (Swift) app currently lacks.

---

## ✅ Fully Covered

These are implemented in both the server and Swift package:

### REST API Endpoints

- **Health:** `GET /health`, `GET /api`
- **Sessions:**
  - `GET /sessions` (list)
  - `POST /sessions` (create)
  - `GET /sessions/:id` (get)
  - `POST /sessions/:id/activate` (activate)
  - `GET /sessions/:id/events` (poll events)
  - `GET /sessions/:id/history` (session JSONL history)
  - `DELETE /sessions/:id` (delete)
- **GitHub:**
  - `GET /github/token` (token info)
  - `POST /github/token` (set token)
  - `DELETE /github/token` (delete token)
  - `GET /github/repos` (list repos)
- **Models:** `GET /models` (list), `GET /models/full`
- **Secrets:** `GET /secrets`, `POST /secrets`, `PUT /secrets/:id`, `DELETE /secrets/:id`
- **Environments:** `GET /environments`, `POST /environments`, `GET /environments/:id`, `PUT /environments/:id`, `DELETE /environments/:id`, `POST /environments/probe`
- **Settings:** `GET /settings`, `PUT /settings`

### WebSocket RPC Commands

All 30+ `ClientCommand` types are present in both:

- Prompting: `prompt`, `steer`, `follow_up`, `abort`
- Session: `new_session`, `get_state`, `get_messages`
- Model: `set_model`, `cycle_model`, `get_available_models`
- Thinking: `set_thinking_level`, `cycle_thinking_level`
- Queue modes: `set_steering_mode`, `set_follow_up_mode`
- Compaction: `compact`, `set_auto_compaction`
- Retry: `set_auto_retry`, `abort_retry`
- Bash: `bash`, `abort_bash`
- Session management: `get_session_stats`, `export_html`, `switch_session`, `fork`, `get_fork_messages`, `get_last_assistant_text`, `set_session_name`
- Discovery: `get_commands`
- Extension UI: `extension_ui_response`

All `ServerEvent` types are present:

- Relay lifecycle: `connected`, `replay_start`, `replay_end`, `sandbox_status`, `error`
- Agent lifecycle: `agent_start`, `agent_end`, `turn_start`, `turn_end`
- Message streaming: `message_start`, `message_update`, `message_end`
- Tool execution: `tool_execution_start`, `tool_execution_update`, `tool_execution_end`
- Compaction: `auto_compaction_start`, `auto_compaction_end`
- Retry: `auto_retry_start`, `auto_retry_end`
- Extension: `extension_error`, `extension_ui_request`
- RPC: `response`

---

## ❌ Missing in Swift Package

These REST API features exist on the server but **are not modeled** in the Swift client (no request/response structs):

### REST API Gaps

1. **Settings API:**
   - `GET /settings/sandbox-providers` — list available sandbox provider types
   - *(The Swift package has SettingsRequest but it's incomplete)*

2. **Environment Images:**
   - `GET /environments/images` — list available Docker images (hardcoded server-side: `general-dexterity/pi-sandbox-base`, `general-dexterity/pi-sandbox-node`, etc.)

3. **Extended Session Responses:**
   - The Swift `CreateSessionResponse` and `ActivateSessionResponse` structs exist, but some fields from the server responses may not be fully mapped (e.g., `sandboxImageDigest`).

4. **Repos API:**
   - The Swift `Repo` model exists, but there's no dedicated API client method for `GET /github/repos` (it's in `GitHubRequests.swift` as a placeholder, but not fleshed out).

---

## 🔧 Incomplete / Inconsistent

These areas have partial coverage but need alignment:

### Request/Response Type Mismatches

- **Secrets:** The Swift `SecretRequests.swift` file exists but the request/response structs may not be fully aligned with the server's expectations (e.g., `kind` enum, `enabled` flag, error handling for unique constraints).

- **Environments:** The Swift `EnvironmentRequests.swift` has basic CRUD structs, but:
  - No struct for `GET /environments/images` response
  - The `ProbeEnvironmentRequest/Response` exists but may lack full `EnvironmentConfig` detail (e.g., `secretId`, `resourceTier`, `nativeToolsEnabled`)

- **Sessions:** The Swift package handles basic session CRUD, but:
  - No polling/streaming abstraction for `GET /sessions/:id/events` (it's modeled as a raw response, but not wired into a higher-level API)
  - No helper for parsing `GET /sessions/:id/history` (JSONL session entries)

---

## 🚀 Recommended Next Steps

To bring the native app to parity with the server:

1. **Add missing REST endpoints:**
   - Implement `GET /settings/sandbox-providers` (returns list of available provider types)
   - Implement `GET /environments/images` (returns Docker image catalog)

2. **Flesh out request/response structs:**
   - Align `Secret` model with server's `SecretKind` enum (`ai_provider`, `env_var`, `sandbox_provider`)
   - Add `secretId`, `resourceTier`, `nativeToolsEnabled` to `EnvironmentConfig` in Swift

3. **Create higher-level API clients:**
   - Build a `RelayAPIClient` Swift class that wraps HTTP calls (currently the structs exist but there's no unified client)
   - Build a `WebSocketClient` wrapper for `ClientCommand` → `ServerEvent` RPC flow
   - Add event polling/replay helpers for `GET /sessions/:id/events`

4. **Add UI for missing features:**
   - Settings: sandbox provider selection UI
   - Environments: Docker image picker, Cloudflare Worker URL/secret config
   - Secrets: kind selector, enabled toggle

5. **Testing:**
   - Integration tests that hit the relay server from Swift
   - Mock server for unit testing the Swift client without a live relay

---

## 📊 Coverage Summary

| Feature | Server Support | Swift Client Support | Status |
|---------|----------------|----------------------|--------|
| REST API (core) | ✅ All endpoints | ✅ Request/response structs | **Complete** |
| REST API (settings) | ✅ `/sandbox-providers` | ❌ Missing | **Gap** |
| REST API (images) | ✅ `/environments/images` | ❌ Missing | **Gap** |
| WebSocket RPC | ✅ All 30+ commands | ✅ All commands | **Complete** |
| WebSocket Events | ✅ All event types | ✅ All event types | **Complete** |
| API Client Library | N/A | ❌ No unified client | **Gap** |
| Event Polling/Replay | ✅ Server-side journal | ⚠️ Struct only, no helper | **Incomplete** |
| Session History (JSONL) | ✅ `/sessions/:id/history` | ⚠️ Struct only, no parser | **Incomplete** |

**Overall:** The Swift package has ~90% coverage of the *data models*, but lacks a cohesive client library and is missing 2-3 newer REST endpoints. The WebSocket RPC layer is fully covered.

---

## 🗂️ File Structure Reference

### Server (TypeScript)

```
apps/relay-server/src/
├── routes/
│   ├── health.ts              ✅ Covered
│   ├── sessions.ts            ✅ Covered
│   ├── secrets.ts             ✅ Covered
│   ├── environments.ts        ⚠️ Partially covered (missing /images)
│   ├── github.ts              ✅ Covered
│   ├── models.ts              ✅ Covered
│   └── settings.ts            ⚠️ Partially covered (missing /sandbox-providers)
└── ws/
    ├── types.ts               ✅ Covered
    └── handler.ts             ✅ Covered
```

### Swift Client

```
packages/pi-core/Sources/PiCore/Relay/
├── API/
│   ├── APIResponse.swift           ✅
│   ├── HealthResponse.swift        ✅
│   ├── SessionRequests.swift       ✅
│   ├── SecretRequests.swift        ⚠️ Needs kind enum
│   ├── EnvironmentRequests.swift   ⚠️ Missing /images response
│   ├── GitHubRequests.swift        ⚠️ Stub only
│   ├── ModelsResponse.swift        ✅
│   └── SettingsRequests.swift      ⚠️ Missing /sandbox-providers
├── WebSocket/
│   ├── ClientCommand.swift         ✅
│   └── ServerEvent.swift           ✅
└── Models/
    ├── Session.swift               ✅
    ├── Secret.swift                ⚠️ Needs kind field
    ├── Environment.swift           ⚠️ Needs config detail
    ├── Repo.swift                  ✅
    └── GitHubTokenInfo.swift       ✅
```

---

**End of Gap Analysis**
