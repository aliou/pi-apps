# Slash Commands Design

Cross-platform slash command system for macOS and iOS Pi apps.

## Overview

When the user types `/` at the start of their message, a fuzzy-filtered command list appears above the input. Arrow keys navigate, Tab/Enter selects (without submitting), Escape dismisses.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        PiCore                                │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │  SlashCommand   │  │  SlashCommandMatcher            │   │
│  │  (model)        │  │  (fuzzy matching, ranking)      │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         PiUI                                 │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ SlashCommand    │  │  SlashCommandListView           │   │
│  │ State           │  │  (renders filtered commands)    │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SlashCommandPresenter                                │   │
│  │  (wraps input, manages overlay, handles keys)         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│    Desktop App          │    │    Mobile App           │
│    ConversationView     │    │    ConversationView     │
│    (wraps input with    │    │    (wraps input with    │
│     SlashCommandPresenter)   │     SlashCommandPresenter)
└─────────────────────────┘    └─────────────────────────┘
```

## Components

### 1. SlashCommand Model (PiCore)

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommand.swift

/// A slash command that can be invoked from the input
public struct SlashCommand: Identifiable, Sendable, Hashable {
    public let id: String
    public let name: String           // e.g., "clear"
    public let description: String    // e.g., "Clear conversation history"
    public let icon: String?          // SF Symbol name
    public let modes: Set<SessionMode> // which modes support this command
    public let insertText: String?    // text to insert (nil = action only)
    
    public init(
        id: String? = nil,
        name: String,
        description: String,
        icon: String? = nil,
        modes: Set<SessionMode> = [.chat, .code],
        insertText: String? = nil
    ) {
        self.id = id ?? name
        self.name = name
        self.description = description
        self.icon = icon
        self.modes = modes
        self.insertText = insertText
    }
}
```

### 2. SlashCommandMatcher (PiCore)

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommandMatcher.swift

public enum SlashCommandMatcher {
    /// Returns commands matching the query, ranked by relevance
    public static func match(
        query: String,
        in commands: [SlashCommand],
        mode: SessionMode
    ) -> [SlashCommand] {
        let modeFiltered = commands.filter { $0.modes.contains(mode) }
        
        guard !query.isEmpty else {
            return modeFiltered
        }
        
        let lowercaseQuery = query.lowercased()
        
        // Score each command
        var scored: [(command: SlashCommand, score: Int)] = []
        
        for command in modeFiltered {
            let name = command.name.lowercased()
            
            // Exact prefix match = highest score
            if name.hasPrefix(lowercaseQuery) {
                scored.append((command, 100 - name.count))
            }
            // Contains match = lower score
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

### 3. Default Commands

```swift
// packages/pi-core/Sources/PiCore/Models/SlashCommands.swift

extension SlashCommand {
    /// Built-in slash commands
    public static let builtIn: [SlashCommand] = [
        // Universal commands
        SlashCommand(
            name: "clear",
            description: "Clear conversation history",
            icon: "trash",
            modes: [.chat, .code]
        ),
        SlashCommand(
            name: "help",
            description: "Show available commands",
            icon: "questionmark.circle",
            modes: [.chat, .code]
        ),
        SlashCommand(
            name: "model",
            description: "Switch AI model",
            icon: "cpu",
            modes: [.chat, .code]
        ),
        
        // Chat-only commands
        SlashCommand(
            name: "new",
            description: "Start a new conversation",
            icon: "plus.bubble",
            modes: [.chat]
        ),
        SlashCommand(
            name: "system",
            description: "Set system prompt",
            icon: "gearshape",
            modes: [.chat],
            insertText: "/system "
        ),
        
        // Code-only commands
        SlashCommand(
            name: "repo",
            description: "Switch repository",
            icon: "folder",
            modes: [.code]
        ),
        SlashCommand(
            name: "branch",
            description: "Switch branch",
            icon: "arrow.triangle.branch",
            modes: [.code]
        ),
        SlashCommand(
            name: "diff",
            description: "Show uncommitted changes",
            icon: "plus.forwardslash.minus",
            modes: [.code]
        ),
        SlashCommand(
            name: "commit",
            description: "Commit current changes",
            icon: "checkmark.circle",
            modes: [.code]
        ),
        SlashCommand(
            name: "compact",
            description: "Compact conversation history",
            icon: "arrow.down.right.and.arrow.up.left",
            modes: [.code]
        ),
        
        // Prompt templates (insert text)
        SlashCommand(
            name: "review",
            description: "Request code review",
            icon: "eye",
            modes: [.code],
            insertText: "Review the recent changes and suggest improvements"
        ),
        SlashCommand(
            name: "test",
            description: "Write tests for recent changes",
            icon: "checkmark.diamond",
            modes: [.code],
            insertText: "Write tests for the code I just changed"
        ),
        SlashCommand(
            name: "explain",
            description: "Explain how code works",
            icon: "text.book.closed",
            modes: [.chat, .code],
            insertText: "Explain how "
        ),
    ]
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
    
    private let commands: [SlashCommand]
    private let mode: SessionMode
    
    public init(commands: [SlashCommand] = SlashCommand.builtIn, mode: SessionMode) {
        self.commands = commands
        self.mode = mode
    }
    
    /// Call when text changes to update slash command state
    public func update(text: String) {
        // Only trigger when text starts with "/"
        if text.hasPrefix("/") {
            query = String(text.dropFirst())
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands, mode: mode)
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
    
    public func updateMode(_ mode: SessionMode) {
        // Re-filter when mode changes
        if isShowing {
            filteredCommands = SlashCommandMatcher.match(query: query, in: commands, mode: mode)
            highlightedIndex = min(highlightedIndex, max(0, filteredCommands.count - 1))
            isShowing = !filteredCommands.isEmpty
        }
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
                        #if os(macOS)
                        .onHover { hovering in
                            // Optional: highlight on hover for macOS
                        }
                        #endif
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
    
    var body: some View {
        HStack(spacing: 12) {
            if let icon = command.icon {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(isHighlighted ? Theme.accent : Theme.textSecondary)
                    .frame(width: 20)
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text("/\(command.name)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(isHighlighted ? Theme.text : Theme.text)
                
                Text(command.description)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
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

### 6. Input Integration

#### Desktop ConversationView

```swift
// apps/desktop/Sources/Views/ConversationView.swift (inputArea modification)

@State private var slashState = SlashCommandState(mode: .chat)

private var inputArea: some View {
    ZStack(alignment: .bottom) {
        // Slash command overlay (appears above input)
        if slashState.isShowing {
            SlashCommandListView(
                commands: slashState.filteredCommands,
                highlightedIndex: slashState.highlightedIndex,
                onSelect: { command in
                    handleSlashCommand(command)
                }
            )
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 16)
            .offset(y: -60) // Position above input bar
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
        
        // Existing input bar
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .focused($isInputFocused)
                .lineLimit(1...5)
                .onChange(of: inputText) { _, newValue in
                    slashState.update(text: newValue)
                }
                .onKeyPress(keys: [.upArrow, .downArrow, .return, .tab, .escape]) { press in
                    handleKeyPress(press)
                }
                .onSubmit {
                    if !slashState.isShowing {
                        sendMessage()
                    }
                }
            
            // Send/abort button...
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.inputBg)
    }
    .animation(.easeOut(duration: 0.15), value: slashState.isShowing)
}

private func handleKeyPress(_ press: KeyPress) -> KeyPress.Result {
    guard slashState.isShowing else { return .ignored }
    
    switch press.key {
    case .upArrow:
        slashState.moveUp()
        return .handled
        
    case .downArrow:
        slashState.moveDown()
        return .handled
        
    case .return, .tab:
        if let command = slashState.selectedCommand() {
            handleSlashCommand(command)
            return .handled
        }
        return .ignored
        
    case .escape:
        slashState.dismiss()
        inputText = ""
        return .handled
        
    default:
        return .ignored
    }
}

private func handleSlashCommand(_ command: SlashCommand) {
    slashState.dismiss()
    
    if let insertText = command.insertText {
        // Insert text template
        inputText = insertText
    } else {
        // Execute action
        inputText = ""
        executeCommand(command)
    }
}

private func executeCommand(_ command: SlashCommand) {
    switch command.name {
    case "clear":
        // Clear conversation
        break
    case "model":
        // Show model selector
        break
    case "help":
        // Show help
        break
    // ... handle other commands
    default:
        break
    }
}
```

#### Mobile ConversationView

Same pattern, but with slight differences for iOS touch:

```swift
// apps/mobile/Sources/Views/ConversationView.swift (inputBar modification)

@State private var slashState = SlashCommandState(mode: .chat)

private var inputBar: some View {
    ZStack(alignment: .bottom) {
        // Slash command overlay
        if slashState.isShowing {
            SlashCommandListView(
                commands: slashState.filteredCommands,
                highlightedIndex: slashState.highlightedIndex,
                onSelect: { command in
                    handleSlashCommand(command)
                }
            )
            .frame(maxWidth: .infinity)
            .padding(.horizontal)
            .offset(y: -70) // Position above input
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
        
        HStack(alignment: .bottom, spacing: 12) {
            // Plus button...
            
            TextField(
                currentMode == .chat ? "Ask anything..." : "Code anything...",
                text: $inputText,
                axis: .vertical
            )
            .textFieldStyle(.plain)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 24))
            .focused($isInputFocused)
            .onChange(of: inputText) { _, newValue in
                withAnimation(.easeOut(duration: 0.15)) {
                    slashState.update(text: newValue)
                }
            }
            // iOS hardware keyboard support
            .onKeyPress(keys: [.upArrow, .downArrow, .return, .tab, .escape]) { press in
                handleKeyPress(press)
            }
            .onSubmit {
                if slashState.isShowing {
                    if let command = slashState.selectedCommand() {
                        handleSlashCommand(command)
                    }
                } else {
                    let text = trimmedInputText
                    guard !text.isEmpty else { return }
                    inputText = ""
                    isInputFocused = false
                    autoScrollEnabled = true
                    Task { await sendMessage(text) }
                }
            }
            .submitLabel(.send)
            
            // Send button...
        }
    }
    .animation(.easeOut(duration: 0.15), value: slashState.isShowing)
}
```

## Interaction Summary

| Platform | Trigger | Navigate | Select | Dismiss |
|----------|---------|----------|--------|---------|
| macOS | Type `/` | ↑/↓ arrows | Tab or Enter | Escape or delete `/` |
| iOS | Type `/` | ↑/↓ (hw keyboard) or tap | Tap or Enter (hw keyboard) | Escape or delete `/` |

## Key Behaviors

1. **Trigger**: Only when text starts with `/`
2. **Filter**: Real-time fuzzy matching as user types after `/`
3. **Selection**: Tab/Enter inserts command (if `insertText`) or executes action
4. **No Submit**: Selecting a command does NOT submit the message
5. **Mode-aware**: Commands filtered by current session mode (chat/code)

## Future Enhancements

- Cursor-aware slash commands (trigger `/` anywhere, not just start)
- Command arguments (e.g., `/model sonnet`)
- Recently used commands section
- Custom user-defined commands
- Keyboard shortcut hints in list
