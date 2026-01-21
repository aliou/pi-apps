---
name: ios-26
description: iOS 26 / iPadOS 26 development with Xcode 26 and Swift 6.2. Use when building iOS apps targeting iOS 26. Covers Liquid Glass design system, SwiftUI APIs, navigation patterns, tab bars, search, and Swift 6.2 language features.
---

# iOS 26 Development

iOS 26 was released September 2025. Apple unified all platform version numbers to "26" (iOS, iPadOS, macOS, watchOS, tvOS, visionOS) for the 2025-2026 release cycle. Future versions: iOS 27, iOS 28, etc.

## Liquid Glass Design System

Liquid Glass is a translucent material that reflects and refracts surroundings. Core principle: **content first**. Standard SwiftUI components automatically adopt Liquid Glass materials.

### Navigation Bars

Navigation bars use Liquid Glass materials by default. Large titles scroll with content underneath the bar.

```swift
NavigationStack {
    List {
        // content
    }
    .navigationTitle("Library")
    .navigationSubtitle("42 items") // New in iOS 26
}
```

**Navigation Subtitles:** Use `.navigationSubtitle(_:)` for secondary text below the title. Inline titles and subtitles shift to leading edge when trailing toolbar items need space.

### Tab Bars

Tab bars minimize on scroll and expand when scrolling back up. The compact state shows only the active tab icon.

```swift
TabView {
    Tab("Library", systemImage: "books.vertical") {
        LibraryView()
    }
    Tab("Store", systemImage: "bag") {
        StoreView()
    }
}
.tabBarMinimizeBehavior(.onScrollDown)
```

**Minimize Behaviors:**
- `.onScrollDown` – Collapses when scrolling down
- `.never` – Tab bar stays expanded
- `.automatic` – System decides based on content

### Bottom Accessory

Add a floating accessory above the tab bar that moves inline when scrolling:

```swift
TabView {
    // tabs
}
.tabViewBottomAccessory {
    NowPlayingBar()
}
```

The accessory transitions from expanded (floating above tab bar) to inline (integrated with tab bar) during scroll.

### Search Tab

Search appears as a floating button at bottom-right for reachability. When tapped, it expands into a search field and the tab bar minimizes.

```swift
TabView {
    Tab("Library", systemImage: "books.vertical") {
        LibraryView()
    }
    Tab("Store", systemImage: "bag") {
        StoreView()
    }
    Tab(role: .search) {
        SearchView()
            .searchable(text: $searchText)
    }
}
```

The `.search` role positions the search button separately from other tabs with Liquid Glass styling.

**Minimize Search Field:** If search isn't primary, minimize it into a toolbar button:

```swift
.searchToolbarBehavior(.minimize)
```

### Toolbars

Toolbars have glassy backgrounds and support splitting into groups. Symbol-based items are preferred over text.

```swift
.toolbar {
    ToolbarItem(placement: .confirmationAction) {
        Button("Save") { }
    }
    ToolbarSpacer(.flexible)
    ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") { }
    }
}
```

**ToolbarSpacer:** New type for controlling toolbar layout with `.fixed` or `.flexible` spacing.

**Close Button Role:**
```swift
Button(role: .close) { dismiss() }
```
Creates an X mark with glass effect, ideal for sheets and popovers.

### Scroll Edge Effect

Control the blur effect at scroll edges:

```swift
ScrollView {
    // content
}
.scrollEdgeEffect(.blur) // or .none
```

Use `.safeAreaInset(edge: .bottom)` to disable the effect, or `ToolbarItem(placement: .bottomBar)` to activate it.

## Glass Effect for Custom Views

### Basic Glass Effect

```swift
Button("Action") { }
    .glassEffect()
```

SwiftUI handles all visuals: blur, refraction, light/dark adaptation.

### Glass Button Style

```swift
Button("Action") { }
    .buttonStyle(.glass)
```

### GlassEffectContainer

Combine multiple glass shapes into a single morphing shape:

```swift
GlassEffectContainer {
    HStack {
        Button("One") { }
            .glassEffect()
        Button("Two") { }
            .glassEffect()
    }
}
```

Benefits: blends overlapping shapes, consistent blur/lighting, smooth morphing transitions, better performance.

### Glass Effect Union

Group views into a single glass effect without extra containers:

```swift
Button("One") { }
    .glassEffect()
    .glassEffectUnion(id: "toolbar")

Button("Two") { }
    .glassEffect()
    .glassEffectUnion(id: "toolbar")
```

## SwiftUI New Views

### WebView

Native web content embedding with full browsing experience:

```swift
WebView(url: URL(string: "https://example.com")!)
```

**Custom Navigation with WebPage:**

```swift
@State private var page = WebPage()

WebView(page)
    .onAppear {
        page.load(URLRequest(url: myURL))
    }
```

`WebPage` is `@Observable` and exposes navigation state, title, URL, loading status.

### TextEditor with Rich Text

TextEditor now supports `AttributedString` for rich text editing:

```swift
@State private var content = AttributedString("Hello, World!")

TextEditor(text: $content)
```

Users can style text directly. You can programmatically set bold, italic, colors, links.

## SwiftUI New Modifiers

### @Animatable Macro

Synthesizes `Animatable` protocol conformance:

```swift
@Animatable
struct PulsingCircle: View {
    var scale: Double

    var body: some View {
        Circle()
            .scaleEffect(scale)
    }
}
```

Works with views, view modifiers, shapes, and text renderers.

### Scene Padding

Automatically adds appropriate padding for the current scene:

```swift
.scenePadding()
```

### Fixed-Width Label Icons

Consistent icon widths in labels:

```swift
Label("Settings", systemImage: "gear")
    .labelIconWidth(30)
```

### List Section Index

Add section index for quick navigation:

```swift
List {
    ForEach(sections) { section in
        Section(section.title) {
            // content
        }
        .listSectionIndex(section.indexLabel)
    }
}
```

### In-App Browser

Open URLs in-app instead of Safari:

```swift
.environment(\.openURL, OpenURLAction { url in
    // Handle URL in-app
    return .handled
})
```

## Swift 6.2 Language Features

Swift 6.2 ships with Xcode 26. Key features for iOS development:

### InlineArray

Fixed-size arrays stored on the stack (no heap allocation):

```swift
var buffer: InlineArray<4, Int> = [1, 2, 3, 4]
buffer[0] = 10
```

Use for performance-critical fixed-size collections.

### Span

Efficient, non-owning view into contiguous memory:

```swift
func process(_ data: Span<UInt8>) {
    for byte in data {
        // process
    }
}
```

### Raw Identifiers

Use reserved words as identifiers with backticks in more contexts:

```swift
let `class` = "MyClass"
let `default` = Settings()
```

### Default Values in String Interpolation

```swift
func greet(name: String? = nil) {
    print("Hello, \(name, default: "World")!")
}
```

### Concurrency Improvements

**@concurrent Attribute:**

```swift
@concurrent
func fetchData() async -> Data {
    // Runs on cooperative thread pool
}
```

**Default MainActor Option:** Build setting `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` runs code on main thread by default. Opt-in for simpler apps.

**Working with GRDB under Strict Concurrency:**

When using GRDB with `MainActor` default isolation, model types passed to database operations must be `Sendable`. Pattern:

```swift
// 1. Make model types explicitly Sendable
struct MyModel: Identifiable, Equatable, Sendable {
    var id: UUID
    var name: String
}

// 2. For protocol conformances that run off main actor,
//    mark methods as nonisolated
extension MyModel: FetchableRecord, PersistableRecord {
    nonisolated init(row: Row) throws {
        id = row["id"]
        name = row["name"]
    }
    
    nonisolated func encode(to container: inout PersistenceContainer) {
        container["id"] = id
        container["name"] = name
    }
}
```

**Common Error:** "Main actor-isolated conformance of 'X' to 'Protocol' cannot satisfy conformance requirement for a 'Sendable' type parameter"

**Fix:** Add `Sendable` to the type and `nonisolated` to protocol methods that the library calls from background threads.

### enumerated() Conforms to Collection

```swift
for (index, element) in array.enumerated() {
    // index and element available
}
// enumerated() now conforms to Collection, enabling more operations
```

## Xcode 26

### Performance

- 30-40% faster build times
- Improved Swift type checking
- Better incremental compilation

### Swift 6 Build Settings

New projects may have these settings enabled by default:

| Setting | Value | Effect |
|---------|-------|--------|
| `SWIFT_DEFAULT_ACTOR_ISOLATION` | `MainActor` | All code runs on main actor by default |
| `SWIFT_APPROACHABLE_CONCURRENCY` | `YES` | Relaxed concurrency checking for beginners |
| `SWIFT_UPCOMING_FEATURE_MEMBER_IMPORT_VISIBILITY` | `YES` | Stricter import visibility |

To check/modify: Target → Build Settings → search "Swift"

### File System Synchronized Groups

Xcode 26 projects use synchronized groups by default. All files in a folder are automatically included in the target.

**Implication:** Files like `Info.plist` that should NOT be copied as bundle resources must be placed OUTSIDE synchronized folders. Put `Info.plist` at project root, not inside the app folder.

### Icon Composer

Create Liquid Glass icons that render correctly in light, dark, tinted, and clear looks. Access via Xcode's asset catalog.

## Device Requirements

iOS 26 requires A13 Bionic or newer:
- iPhone 11 and later
- iPhone SE (2nd gen) and later
- iPad (8th gen) and later

## Common Patterns

### Standard App Structure

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var searchText = ""

    var body: some View {
        TabView {
            Tab("Home", systemImage: "house") {
                NavigationStack {
                    HomeView()
                        .navigationTitle("Home")
                }
            }
            Tab("Library", systemImage: "books.vertical") {
                NavigationStack {
                    LibraryView()
                        .navigationTitle("Library")
                        .navigationSubtitle("\(items.count) items")
                }
            }
            Tab(role: .search) {
                NavigationStack {
                    SearchResultsView(query: searchText)
                        .searchable(text: $searchText)
                        .navigationTitle("Search")
                }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
    }
}
```

### Glass Toolbar

```swift
.toolbar {
    ToolbarItemGroup(placement: .bottomBar) {
        Button(action: share) {
            Image(systemName: "square.and.arrow.up")
        }
        .glassEffect()

        ToolbarSpacer(.flexible)

        Button(action: favorite) {
            Image(systemName: "heart")
        }
        .glassEffect()
    }
}
```

### List with Search and Section Index

```swift
NavigationStack {
    List {
        ForEach(groupedItems) { group in
            Section(group.title) {
                ForEach(group.items) { item in
                    ItemRow(item: item)
                }
            }
            .listSectionIndex(group.indexLabel)
        }
    }
    .searchable(text: $searchText)
    .searchToolbarBehavior(.minimize)
    .navigationTitle("Items")
}
```
