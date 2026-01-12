# Pi Apps - Agent Guide

Native Apple platform clients for the `pi` CLI coding agent. Currently includes macOS desktop app, with iOS support planned.

## Project Structure

```
pi-apps/
├── apps/
│   ├── desktop/              # macOS app
│   │   ├── project.yml       # XcodeGen spec
│   │   ├── Sources/          # Swift source files
│   │   └── Resources/        # Assets, Info.plist, entitlements
│   └── mobile/               # iOS app (placeholder)
├── packages/
│   └── pi-core/              # Shared Swift package
├── Config/                   # Build configuration (xcconfig files)
├── Makefile                  # Build automation
└── flake.nix                 # Nix dev environment
```

## Architecture

### RPC Communication

The app spawns `pi --mode rpc` as a subprocess and communicates via JSON-RPC over stdin/stdout.

**RPCClient** (`apps/desktop/Sources/Services/RPCClient.swift`):
- Actor-based for thread safety
- Sends commands: `prompt`, `abort`, `get_messages`
- Receives events: `agent_start`, `agent_end`, `message_update`, `tool_execution_start/end`, etc.
- Handles terminal escape sequences in output (strips ANSI codes)

**Key RPC types** (`packages/pi-core/Sources/PiCore/Models/RPCTypes.swift`):
- `RPCCommand` - Commands sent to pi (prompt, abort, get_messages)
- `RPCEvent` - Events received from pi (agent lifecycle, message updates, tool execution)
- All types are `Sendable` for Swift 6 concurrency

### Data Storage

All app data is stored in `~/Library/Application Support/me.aliou.pi-desktop/`:

```
~/Library/Application Support/me.aliou.pi-desktop/
├── bin/
│   └── pi                    # Downloaded pi binary
├── agent/                    # Pi agent sessions (PI_AGENT_DIR)
├── worktrees/               # Git worktrees for sessions
├── sessions/
│   └── index.json           # Session metadata
├── logs/                    # Application logs
└── version.json             # Binary version info
```

**AppPaths** (`apps/desktop/Sources/Services/AppPaths.swift`):
- Centralized path management using `FileManager`
- All paths resolve to Application Support directory
- Automatically creates directories on first access

### Binary Management

**BinaryUpdateService** (`apps/desktop/Sources/Services/BinaryUpdateService.swift`):
- Downloads pi binary from GitHub releases on first launch
- Checks for updates every 24 hours (throttled)
- Shows "Update available" banner when new version exists
- User-triggered updates (not automatic)

**SetupView** (`apps/desktop/Sources/Views/SetupView.swift`):
- Shown on first launch when binary is missing
- Shows download progress
- Blocks app until binary is installed
- Retry button on failure

### Session Management

Each session creates an isolated environment:

1. **Git worktree** - Created in `worktrees/wt-{random}/` from the selected repo
2. **Pi agent directory** - `agent/` (shared, contains pi's session files)
3. **App metadata** - Stored in `sessions/index.json`

**SessionStore** (`apps/desktop/Sources/Models/Session.swift`):
- Persists session list to `index.json`
- Tracks: id, title, repo root, worktree name, pi session file path
- Sessions survive app restarts

**SessionFileParser** (`apps/desktop/Sources/Services/SessionFileParser.swift`):
- Parses pi's JSONL session files to rebuild conversation state
- Merges tool results into tool calls (avoids duplicate IDs)
- Used when resuming sessions

### Git Worktree Isolation

**GitService** (`apps/desktop/Sources/Services/GitService.swift`):
- `findRepoRoot(for:)` - Finds .git directory from selected path
- `createWorktree(repoRoot:name:)` - Creates worktree for session
- `deleteWorktree(repoRoot:name:)` - Cleans up on session delete

Worktrees keep the user's working directory clean while the agent makes changes.

## Theme System

All colors are defined in `packages/pi-core/Sources/PiCore/Theme/Theme.swift` using asset catalog colors that adapt to light/dark mode.

### Using Theme Colors

```swift
// Always use Theme.* instead of hardcoded colors
Text("Hello")
    .foregroundColor(Theme.text)
    .background(Theme.pageBg)

// Tool status colors
Theme.toolStatusColor(status)  // warning/success/error
Theme.toolStatusBg(status)     // pending/success/error backgrounds
```

### Color Categories

| Category | Colors |
|----------|--------|
| Core UI | `accent`, `border`, `success`, `error`, `warning`, `muted`, `dim` |
| Text | `text`, `textSecondary`, `textMuted` |
| Backgrounds | `pageBg`, `cardBg`, `sidebarBg`, `inputBg`, `selectedBg`, `hoverBg` |
| Messages | `userMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg` |
| Markdown | `mdHeading`, `mdLink`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBg`, `mdQuote` |

### Adding New Colors

1. Create color set in `apps/desktop/Resources/Assets.xcassets/{name}.colorset/Contents.json`
2. Add light and dark variants
3. Reference in `Theme.swift`: `static let newColor = Color("newColor")`

Color values are based on pi-cli's theme files:
- Dark: `packages/coding-agent/src/modes/interactive/theme/dark.json`
- Light: `packages/coding-agent/src/modes/interactive/theme/light.json`

## Key Patterns

### Conversation Items

`ConversationView` displays three item types:
- `userMessage` - User's input
- `assistantText` - AI response (rendered with Textual markdown)
- `toolCall` - Collapsible tool execution with status indicator

Tool calls show contextual summaries:
- `read path:1-50` for file reads
- `$ command` for bash
- `edit path` for edits
- Color-coded status: yellow (running), green (success), red (error)

### Markdown Rendering

Uses [Textual](https://github.com/gonzalezreal/textual) library with custom styles in `MarkdownTheme.swift`:
- `PiMarkdownStyle` - Main style configuration
- `PiHeadingStyle` - Gold headings with size scaling
- `PiCodeBlockStyle` - Green code on dark background
- `PiBlockQuoteStyle` - Gray with left border

### State Management

`MainView` owns the app state via `@State`:
- `appState` - Connection status, processing flag, RPC client
- `sessions` - Session list from SessionStore
- `selectedSessionId` - Currently active session
- `conversationItems` - Messages for current session
- `expandedToolCalls` - Which tool calls are expanded

## Development

### Prerequisites

- Xcode 16+ (Swift 6)
- Nix (for development environment)
- Pi binary is downloaded automatically on first launch

### Quick Start

```bash
# Enter development environment
nix develop

# First-time setup (creates Local.xcconfig, generates project)
make setup

# Open in Xcode
make xcode
```

### Build Commands

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup |
| `make generate` | Regenerate Xcode project from YAML spec |
| `make build` | Build debug version |
| `make build-release` | Build release version |
| `make test` | Run tests |
| `make clean` | Remove generated projects and build artifacts |
| `make xcode` | Generate project and open in Xcode |

### Configuration

Each developer needs their own bundle IDs to avoid code signing conflicts. On first `make setup`, a `Config/Local.xcconfig` is created. Edit it:

```xcconfig
PI_DESKTOP_BUNDLE_ID = dev.yourname.pi.desktop
PI_MOBILE_BUNDLE_ID = dev.yourname.pi.mobile
```

### Running the App

**Never open the app programmatically.** Always let the user open/run the app from Xcode. This allows proper debugging, console output visibility, and avoids permission issues with the subprocess.

### Sandbox

App Sandbox is **disabled** in entitlements to allow subprocess spawning and file access.

### Debugging

Log files are written to `logs/pi-{timestamp}.log` within Application Support. Use the global logging functions:

```swift
logDebug("Verbose info")
logInfo("General info")
logWarn("Warning")
logError("Error - also prints to console")
```

The debug panel (ladybug icon) shows:
- RPC events in real-time (throttled)
- Clickable log file path to open in Finder
- Event details on click

## Common Tasks

### Adding a New View

1. Create SwiftUI view in `apps/desktop/Sources/Views/`
2. Use `Theme.*` for all colors
3. Add to navigation in `MainView.swift`

### Adding RPC Event Handling

1. Add event type to `RPCEventType` enum in `packages/pi-core/Sources/PiCore/Models/RPCTypes.swift`
2. Handle in `RPCClient.parseEvent()` 
3. Surface to UI via callback or published property

### Modifying Tool Call Display

Edit `toolCallView()` in `apps/desktop/Sources/Views/ConversationView.swift`. Tool-specific formatting is in `formatToolCall()`.

### Adding Shared Code

Add to `packages/pi-core/Sources/PiCore/`. The package is automatically linked via the XcodeGen project spec.
