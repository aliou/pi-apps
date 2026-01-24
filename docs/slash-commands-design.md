# Slash Commands Design

Cross-platform slash command system for macOS and iOS Pi apps.

## Overview

When the user types `/` at the start of their message, a fuzzy-filtered command list appears above the input. Arrow keys navigate, Tab/Enter selects (without submitting), Escape dismisses.

## Pi RPC Command Discovery

### Current State

**Pi's RPC protocol does not currently expose a `get_commands` endpoint.** The available RPC commands are defined in `rpc-types.ts` but there's no way to discover registered slash commands at runtime.

Pi's slash command system (in interactive/TUI mode) includes:
- `/model` - Switch models (with autocomplete)
- `/settings` - Open settings menu  
- `/session` - Show session info
- `/tree` - Navigate session tree
- `/fork` - Create new conversation fork
- `/resume` - Switch sessions
- `/export` - Export session to HTML
- `/compact` - Manually compact conversation
- `/reload` - Reload extensions, skills, prompts, themes

Plus extension-registered commands via `pi.registerCommand()`.

### Proposed: Add `get_commands` RPC

We should request adding a new RPC command to Pi:

```typescript
// Request
{ "type": "get_commands" }

// Response
{
  "type": "response",
  "command": "get_commands", 
  "success": true,
  "data": {
    "commands": [
      {
        "name": "model",
        "description": "Switch to a different AI model",
        "hasAutocomplete": true,
        "category": "model"
      },
      {
        "name": "compact",
        "description": "Manually compact conversation history",
        "hasAutocomplete": false,
        "category": "session"
      },
      // ... extension-registered commands too
    ]
  }
}
```

**Until this is available**, we have two options:

1. **Hardcode known commands** - Mirror Pi's built-in commands in the client
2. **Skip slash commands** - Wait for RPC support before implementing

### Recommendation

Start with **hardcoded commands** that map to existing RPC functionality, then migrate to dynamic discovery when `get_commands` is added.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        PiCore                                │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  SlashCommand   │  │  SlashCommandMatcher            │   │
│  │  (model)        │  │  (fuzzy matching, ranking)      │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GetCommandsCommand / GetCommandsResponse (future)    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         PiUI                                 │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ SlashCommand    │  │  SlashCommandListView           │   │
│  │ State           │  │  (renders filtered commands)    │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│    Desktop App          │    │    Mobile App           │
│    ConversationView     │    │    ConversationView     │
└─────────────────────────┘    └─────────────────────────┘
```

## Components

### 1. SlashCommand Model (PiCore)

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommand.swift

/// A slash command from Pi
public struct SlashCommand: Identifiable, Codable, Sendable, Hashable {
    public let name: String
    public let description: String?
    public let hasAutocomplete: Bool
    public let category: String?
    
    public var id: String { name }
    
    public init(
        name: String,
        description: String? = nil,
        hasAutocomplete: Bool = false,
        category: String? = nil
    ) {
        self.name = name
        self.description = description
        self.hasAutocomplete = hasAutocomplete
        self.category = category
    }
}

/// Response for get_commands (future RPC)
public struct GetCommandsResponse: Decodable, Sendable {
    public let commands: [SlashCommand]
}
```

### 2. Hardcoded Commands (Temporary)

Until Pi exposes `get_commands`, we mirror known commands:

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommand.swift

extension SlashCommand {
    /// Known Pi slash commands (hardcoded until get_commands RPC exists)
    /// These map to existing RPC commands or Pi TUI functionality
    public static let knownCommands: [SlashCommand] = [
        // Model commands (maps to set_model, cycle_model, get_available_models)
        SlashCommand(
            name: "model",
            description: "Switch to a different AI model",
            hasAutocomplete: true,
            category: "model"
        ),
        
        // Session commands (maps to new_session, switch_session, fork)
        SlashCommand(
            name: "new",
            description: "Start a new session",
            category: "session"
        ),
        SlashCommand(
            name: "fork",
            description: "Fork conversation from a previous message",
            hasAutocomplete: true,
            category: "session"
        ),
        SlashCommand(
            name: "resume",
            description: "Switch to a different session",
            hasAutocomplete: true,
            category: "session"
        ),
        SlashCommand(
            name: "export",
            description: "Export session to HTML",
            category: "session"
        ),
        
        // Context management (maps to compact, get_session_stats)
        SlashCommand(
            name: "compact",
            description: "Compact conversation history",
            category: "context"
        ),
        SlashCommand(
            name: "stats",
            description: "Show token usage and costs",
            category: "context"
        ),
        
        // Thinking level (maps to set_thinking_level, cycle_thinking_level)
        SlashCommand(
            name: "thinking",
            description: "Set reasoning/thinking level",
            hasAutocomplete: true,
            category: "model"
        ),
        
        // Abort (maps to abort)
        SlashCommand(
            name: "abort",
            description: "Abort current operation",
            category: "control"
        ),
        
        // Help
        SlashCommand(
            name: "help",
            description: "Show available commands",
            category: "help"
        ),
    ]
}
```

### 3. SlashCommandMatcher (PiCore)

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommandMatcher.swift

public enum SlashCommandMatcher {
    /// Returns commands matching the query, ranked by relevance
    public static func match(
        query: String,
        in commands: [SlashCommand]
    ) -> [SlashCommand] {
        guard !query.isEmpty else {
            return commands
        }
        
        let lowercaseQuery = query.lowercased()
        var scored: [(command: SlashCommand, score: Int)] = []
        
        for command in commands {
            let name = command.name.lowercased()
            
            // Exact prefix match = highest score
            if name.hasPrefix(lowercaseQuery) {
                scored.append((command, 100 - name.count))
            }
            // Contains match
            else if name.contains(lowercaseQuery) {
                scored.append((command, 50 - name.count))
            }
            // Fuzzy match (all query chars appear in order)
            else if fuzzyMatches(query: lowercaseQuery, in: name) {
                scored.append((command, 25 - name.count))
            }
        }
        
        return scored
            .sorted { $0.score > $1.score }
            .map(\.command)
    }
    
    private static func fuzzyMatches(query: String, in text: String) -> Bool {
        var textIndex = text.startIndex
        for char in query {
            guard let foundIndex = text[textIndex...].firstIndex(of: char) else {
                return false
            }
            textIndex = text.index(after: foundIndex)
        }
        return true
    }
}
```

### 4. SlashCommandState (PiUI)

```swift
// packages/pi-ui/Sources/PiUI/Components/SlashCommands/SlashCommandState.swift

import SwiftUI
import PiCore

@Observable
public final class SlashCommandState {
    public var isShowing = false
    public var query = ""
    public var highlightedIndex = 0
    public var filteredCommands: [SlashCommand] = []
    
    private var commands: [SlashCommand]
    
    public init(commands: [SlashCommand] = SlashCommand.knownCommands) {
        self.commands = commands
    }
    
    /// Update available commands (e.g., from get_commands RPC)
    public func setCommands(_ commands: [SlashCommand]) {
        self.commands = commands
        if isShowing {
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands)
            highlightedIndex = min(highlightedIndex, max(0, filteredCommands.count - 1))
        }
    }
    
    /// Call when text changes to update slash command state
    public func update(text: String) {
        if text.hasPrefix("/") {
            query = String(text.dropFirst())
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands)
            isShowing = !filteredCommands.isEmpty
            highlightedIndex = 0
        } else {
            dismiss()
        }
    }
    
    public func moveUp() {
        guard isShowing else { return }
        highlightedIndex = max(0, highlightedIndex - 1)
    }
    
    public func moveDown() {
        guard isShowing else { return }
        highlightedIndex = min(filteredCommands.count - 1, highlightedIndex + 1)
    }
    
    public func selectedCommand() -> SlashCommand? {
        guard isShowing, highlightedIndex < filteredCommands.count else { return nil }
        return filteredCommands[highlightedIndex]
    }
    
    public func dismiss() {
        isShowing = false
        query = ""
        highlightedIndex = 0
        filteredCommands = []
    }
}
```

### 5. SlashCommandListView (PiUI)

```swift
// packages/pi-ui/Sources/PiUI/Components/SlashCommands/SlashCommandListView.swift

import SwiftUI
import PiCore

public struct SlashCommandListView: View {
    let commands: [SlashCommand]
    let highlightedIndex: Int
    let onSelect: (SlashCommand) -> Void
    
    public init(
        commands: [SlashCommand],
        highlightedIndex: Int,
        onSelect: @escaping (SlashCommand) -> Void
    ) {
        self.commands = commands
        self.highlightedIndex = highlightedIndex
        self.onSelect = onSelect
    }
    
    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, command in
                        SlashCommandRow(
                            command: command,
                            isHighlighted: index == highlightedIndex
                        )
                        .id(command.id)
                        .onTapGesture {
                            onSelect(command)
                        }
                    }
                }
                .padding(8)
            }
            .frame(maxHeight: 220)
            .onChange(of: highlightedIndex) { _, newIndex in
                guard newIndex < commands.count else { return }
                withAnimation(.easeOut(duration: 0.15)) {
                    proxy.scrollTo(commands[newIndex].id, anchor: .center)
                }
            }
        }
        .background(Theme.inputBg)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.15), radius: 8, y: -4)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Theme.borderMuted, lineWidth: 1)
        )
    }
}

struct SlashCommandRow: View {
    let command: SlashCommand
    let isHighlighted: Bool
    
    private var icon: String {
        switch command.category {
        case "model": return "cpu"
        case "session": return "bubble.left.and.bubble.right"
        case "context": return "arrow.triangle.2.circlepath"
        case "control": return "stop.circle"
        case "help": return "questionmark.circle"
        default: return "command"
        }
    }
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(isHighlighted ? Theme.accent : Theme.textSecondary)
                .frame(width: 20)
            
            VStack(alignment: .leading, spacing: 2) {
                Text("/\(command.name)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.text)
                
                if let description = command.description {
                    Text(description)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.textSecondary)
                        .lineLimit(1)
                }
            }
            
            Spacer()
            
            if isHighlighted {
                Text("⏎")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(isHighlighted ? Theme.selectedBg : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
    }
}
```

### 6. Command Execution

When a command is selected, map it to the appropriate RPC call:

```swift
// In ConversationView or a dedicated handler

private func executeSlashCommand(_ command: SlashCommand) async {
    switch command.name {
    case "model":
        // Show model selector sheet
        showModelSelector = true
        
    case "new":
        // Call new_session RPC
        await startNewSession()
        
    case "compact":
        // Call compact RPC
        try? await connection.compact()
        
    case "stats":
        // Call get_session_stats RPC
        if let stats = try? await connection.getSessionStats() {
            showStats(stats)
        }
        
    case "abort":
        // Call abort RPC
        try? await connection.abort()
        
    case "fork":
        // Show fork message selector
        showForkSelector = true
        
    case "resume":
        // Show session history
        showSessionHistory = true
        
    case "export":
        // Call export_html RPC
        if let html = try? await connection.exportHTML() {
            shareHTML(html)
        }
        
    case "thinking":
        // Show thinking level selector or cycle
        try? await connection.cycleThinkingLevel()
        
    case "help":
        // Show help sheet with all commands
        showHelp = true
        
    default:
        // Unknown command - could be extension command
        // For now, insert as text: "/command "
        inputText = "/\(command.name) "
    }
}
```

---

## Interaction Summary

| Platform | Trigger | Navigate | Select | Dismiss |
|----------|---------|----------|--------|---------|
| macOS | Type `/` | ↑/↓ arrows | Tab or Enter | Escape or delete `/` |
| iOS | Type `/` | ↑/↓ (hw keyboard) or tap | Tap or Enter | Escape or delete `/` |

## Key Behaviors

1. **Trigger**: Only when text starts with `/`
2. **Filter**: Real-time fuzzy matching as user types after `/`
3. **Selection**: Tab/Enter executes command action
4. **No Submit**: Selecting a command does NOT submit the message
5. **Commands from Pi**: Eventually fetched via `get_commands` RPC

---

## Migration Path

### Phase 1: Hardcoded Commands (Now)
- Use `SlashCommand.knownCommands` 
- Map to existing RPC calls
- Works without Pi changes

### Phase 2: Dynamic Discovery (After Pi Update)
- Add `GetCommandsCommand` / `GetCommandsResponse` to PiCore
- Fetch commands on session attach
- Support extension-registered commands
- Handle commands with autocomplete (secondary RPC call)

### Phase 3: Full Autocomplete
- For commands with `hasAutocomplete: true`, fetch suggestions
- E.g., `/model` shows available models from `get_available_models`
- E.g., `/fork` shows fork points from `get_fork_messages`

---

## Open Questions

1. **Should we request `get_commands` be added to Pi RPC?** - Yes, file an issue
2. **How to handle extension commands?** - Wait for `get_commands` or allow custom registration
3. **Autocomplete for command arguments?** - Phase 3, needs additional RPC support
