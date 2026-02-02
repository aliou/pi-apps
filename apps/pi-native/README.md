# Pi Native (iOS + macOS)

## Purpose
Pi Native is a from-scratch, multi‑target SwiftUI application meant to establish a modern baseline for a native AI chat + coding agent client on iOS and macOS. It emphasizes 2025‑era platform conventions ("Liquid Glass" translucency, layered depth, and motion) while remaining safe, accessible, and maintainable.

This directory intentionally **does not reuse** code from `apps/desktop` or `apps/mobile`. It is a clean‑room implementation that only shares platform‑agnostic best practices and architectural patterns.

---

## Research: Best Practices for Multi‑Target iOS + macOS Apps (Feb 2, 2026)

### 1) Product & UX Strategy
- **Design for parity, not uniformity.** Maintain conceptual parity across platforms (features, data, capabilities), but allow UX differentiation for input modality, windowing, and multitasking. macOS benefits from denser layouts, richer sidebars, and multi‑window workflows; iOS favors concise views and progressive disclosure.
- **Separate intent from presentation.** Model the domain (sessions, messages, tools, models) and business logic outside of UI layers so that each target can optimize presentation without branching logic in core flows.
- **Leverage platform idioms.**
  - iOS: haptics, pull‑to‑refresh, primary action at bottom, in‑context sheets.
  - macOS: toolbar affordances, inline inspector panels, keyboard shortcuts, and drag‑and‑drop.

### 2) Architecture
- **Layered architecture with boundaries** between:
  1. **Domain:** models, value types, policies (pure Swift, no UI).
  2. **Application:** view models, orchestrators, state machines (async/await, `@MainActor`).
  3. **Infrastructure:** persistence, networking, file access, analytics.
  4. **UI:** SwiftUI views, AppKit/UIView bridging if needed.
- **Prefer feature‑scoped modules** (e.g., `Chat`, `Sessions`, `Tools`, `Models`) and isolate dependencies in a `Core` module to avoid cyclic references.
- **Use unidirectional data flow** to keep state predictable (e.g., simple reducer pattern, or a `ViewModel` with explicit actions and effects).
- **Minimize shared mutable state.** Leverage `Sendable` models, `@MainActor` for UI state, and separate background tasks using `TaskGroup` where appropriate.

### 3) SwiftUI & AppKit Interop
- **SwiftUI-first, AppKit‑where‑needed.** SwiftUI is preferred for new UI; use `NSViewRepresentable`/`UIViewRepresentable` to bridge when high‑performance or native behaviors are missing.
- **Avoid platform‑specific forks** unless required; prefer conditional modifiers and localized view composition to reduce duplication.
- **Adopt modern navigation** with `NavigationStack` and value‑based routing where possible. Keep deep‑linking consistent across platforms.

### 4) Liquid Glass (Translucency & Depth) Design
- **Use layered materials** (`.ultraThinMaterial`, `.thinMaterial`) and subtle gradients to create depth without sacrificing contrast.
- **Maintain legibility** by combining materials with proper foreground contrast, dynamic type support, and background dimming.
- **Limit blur over text** to avoid readability issues. Prefer glass cards with padded content and defined edges.
- **Keep motion calm.** Short, responsive animations reinforce focus without causing distraction or motion sensitivity.

### 5) Accessibility & Localization
- **Dynamic Type everywhere.** Use `.font(.body)` and semantic text styles, not fixed sizes. Avoid hardcoded line heights.
- **Minimum tap targets** 44×44 points; provide keyboard equivalents on macOS.
- **Localization‑ready strings.** Centralize copy and use `LocalizedStringKey` or string tables. Avoid string interpolation for user‑facing labels.
- **VoiceOver & focus ordering.** Ensure logical reading order and meaningful labels for controls.

### 6) Performance & Responsiveness
- **Optimize rendering** with `LazyVStack`, stable IDs, and judicious use of `@StateObject`.
- **Use async/await** for IO and long‑running tasks. Keep UI updates on the main actor.
- **Streaming updates** should batch or debounce to avoid re‑render storms.
- **Avoid holding large conversation history in memory** without paging or summarization for long sessions.

### 7) Data & Persistence
- **Use background persistence** (e.g., SQLite, Core Data, or custom store) for sessions and transcripts, and cache the last N messages for fast load.
- **Keep message IDs stable** across devices to support merge, offline edits, or eventual sync.
- **Encrypt sensitive data** (auth tokens, session secrets) using Keychain and file protection.

### 8) Security & Privacy
- **Principle of least privilege** for entitlements and capabilities.
- **Explain data collection** in‑app and via privacy labels.
- **Guard against prompt injection** when tool calls are allowed, and isolate untrusted content.
- **Validate file access** for code operations and use scoped bookmarks for macOS sandboxing.

### 9) Build & Release Hygiene
- **Automate** with CI for lint, unit tests, and snapshot tests.
- **Use XcodeGen or SwiftPM** for deterministic project generation.
- **Keep config centralized** in `.xcconfig` files.

---

## Research: Best Practices for AI Chat + Coding Agent Apps (Feb 2, 2026)

### 1) Interaction Model & Trust
- **Explicit agent state**: clearly show if the agent is thinking, streaming, or executing tools.
- **Explainability**: show tool inputs/outputs and allow users to inspect or redact actions.
- **User control**: provide pause/abort, retry, and manual edit points.
- **Provenance**: highlight which data sources were used and when.

### 2) Context Management
- **Token budgeting**: keep a rolling summary and clip or compress older content.
- **Chunk code**: split large code files and send diff‑based updates rather than entire files.
- **Personalization with guardrails**: allow custom instructions but sandbox tool usage.

### 3) Tooling & Execution Safety
- **Tool whitelisting** and sandboxing for file ops, network, and system access.
- **Audit logs** for tool calls; ensure the user can review or export them.
- **Idempotent operations**: enforce safe retries for patching and file changes.
- **Structured tool outputs** to prevent prompt injection via untrusted tool results.

### 4) Code‑Aware UX
- **Diff‑first UI**: show edits as diffs, allow selective apply/reject.
- **Typed repositories**: show repo state, branch, and dirty files at a glance.
- **Inline diagnostics**: present errors from builds/lints with quick fixes.

### 5) Performance & Streaming
- **Streaming UI** with incremental rendering; avoid reflow by appending updates rather than re‑creating views.
- **Backpressure**: throttle tokens and UI updates for stable scroll/selection behavior.

### 6) Offline & Reliability
- **Graceful degradation**: allow browsing previous sessions when offline.
- **Retry strategy** with exponential backoff for reconnections.
- **Deterministic resumes**: persist the last known message sequence and replay changes after reconnect.

### 7) Responsible AI
- **Safety policies** should be visible and actionable (not hidden in terms).
- **Clear boundaries** for tool actions, especially for code execution, file deletion, or network access.
- **Privacy‑first** defaults for logging and analytics.

---

## Pi Native Implementation Notes

### Current Scope
- **Shared SwiftUI UI** in `Sources/Shared/`.
- **Per‑platform entry points** in `Sources/iOS/` and `Sources/macOS/`.
- **Glass‑inspired UI** with layered materials and depth.

### Project Structure
```
apps/pi-native/
├─ project.yml
├─ README.md
├─ Resources/
│  ├─ Assets.xcassets/
│  ├─ iOS/Info.plist
│  └─ macOS/Info.plist
└─ Sources/
   ├─ Shared/
   │  ├─ Models/
   │  ├─ ViewModels/
   │  └─ Views/
   ├─ iOS/
   └─ macOS/
```

### Next Steps (Recommended)
- Add a relay client (REST + WebSocket) with protocol‑layer isolation.
- Add structured tool call UI and streaming transcript view.
- Introduce persistence for sessions and offline history.
- Add tests for view models and deterministic reducer logic.

