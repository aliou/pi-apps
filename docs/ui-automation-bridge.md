# UI Automation Bridge

A minimal, tool-agnostic harness for driving the PiNative iOS app from an external orchestrator. All bridge logic lives in two files inside the `PiNative UITests` target; everything else in the project is unchanged.

## Architecture

```
tools/ui-automation-runner.sh       <- Integration surface (scheme, destination knobs)
clients/native/apps/ios/
└── UITests/
    ├── AutomationBridge.swift      <- Action handlers + JSON types (isolated)
    └── AutomationBridgeHarness.swift  <- XCTestCase entry point
```

`AutomationBridgeHarness.testRunAction` is the single XCTest method the runner invokes. It reads a JSON payload from the environment, calls `AutomationBridge.execute()`, then writes the result JSON back to disk and stdout.

## Contract

### Input

The harness reads the action payload from the environment using two variables (checked in order):

| Variable | Type | Description |
|---|---|---|
| `UI_AUTOMATION_PAYLOAD_PATH` | string (file path) | Path to a JSON file containing the payload (preferred) |
| `UI_AUTOMATION_PAYLOAD_JSON` | string (inline JSON) | Raw JSON payload (fallback when no file is needed) |

Payload shape:
```json
{
  "action": "tap",
  "params": { "identifier": "submit-btn" },
  "metadata": {}
}
```

`params` and `metadata` are optional. Unknown `action` values return a structured error.

### Output

The harness writes the result to `UI_AUTOMATION_RESULT_PATH` (if set) and always prints to stdout.

Result shape:
```json
{
  "ok": true,
  "action": "tap",
  "data": { "identifier": "submit-btn" },
  "errors": [{ "message": "...", "code": "...", "hint": "..." }],
  "warnings": ["..."]
}
```

`data`, `errors`, and `warnings` are omitted when empty. `ok` is `false` for any failure; `errors` will contain at least one entry explaining why.

## Supported Actions

### `describe_ui`

Returns all visible interactive elements (buttons, text fields, labels, etc.).

```json
{ "action": "describe_ui" }
```

Result `data`:
```json
{
  "elements": [
    { "type": "Button", "label": "Sign In", "identifier": "sign-in-btn", "isHittable": true }
  ],
  "count": 1
}
```

### `tap`

Tap an element by accessibility identifier. Falls back to absolute coordinates.

```json
{ "action": "tap", "params": { "identifier": "sign-in-btn" } }
{ "action": "tap", "params": { "x": 195.0, "y": 422.0 } }
```

### `type`

Type text into a field by accessibility identifier, or into the currently focused field.

```json
{ "action": "type", "params": { "identifier": "username-field", "text": "alice" } }
{ "action": "type", "params": { "text": "hello" } }
```

### `query_text`

Find elements whose label contains or exactly matches the given text.

```json
{ "action": "query_text", "params": { "text": "Sign In" } }
{ "action": "query_text", "params": { "text": "Sign In", "match": "exact" } }
```

`match` accepts `"contains"` (default, case-insensitive) or `"exact"` (case-insensitive).

Result `data`:
```json
{
  "matches": [
    { "label": "Sign In", "identifier": "sign-in-btn", "type": "Button", "isHittable": true }
  ],
  "count": 1,
  "text": "Sign In",
  "match": "contains"
}
```

### `wait_for`

Wait for an element to reach a given state. Blocks until timeout.

```json
{ "action": "wait_for", "params": { "identifier": "spinner", "state": "absent", "timeout": 15 } }
{ "action": "wait_for", "params": { "identifier": "dashboard", "state": "exists" } }
{ "action": "wait_for", "params": { "identifier": "submit-btn", "state": "hittable" } }
```

`state` accepts `"exists"` (default), `"hittable"`, or `"absent"`. `timeout` defaults to 10 seconds.

### `assert`

Assert one or more conditions on an element. Returns `ok: false` with structured errors for each failed assertion.

```json
{ "action": "assert", "params": { "identifier": "submit-btn", "exists": true } }
{ "action": "assert", "params": { "identifier": "submit-btn", "hittable": true } }
{ "action": "assert", "params": { "identifier": "title-label", "label": "Welcome" } }
```

Multiple conditions can be combined in one call. All failures are reported together.

## Running Locally

### Via runner script (recommended)

```bash
# From repo root
tools/ui-automation-runner.sh '{"action":"describe_ui"}'
tools/ui-automation-runner.sh '{"action":"tap","params":{"identifier":"sign-in-btn"}}'
```

The script:
1. Writes the payload to a temp file.
2. Detects any booted iOS simulator; falls back to `iPhone 17 Pro, iOS 26.1`.
3. Runs `xcodebuild test` for the `PiNative UITests` scheme, targeting only `testRunAction`.
4. Reads the result file and prints it to stdout.
5. Exits 0 if `ok: true`, 1 if `ok: false` or if xcodebuild failed.

### Knobs

| Variable | Default | Description |
|---|---|---|
| `UI_AUTOMATION_SCHEME` | `PiNative UITests` | xcodebuild scheme |
| `UI_AUTOMATION_DESTINATION` | booted sim or `iPhone 17 Pro, iOS 26.1` | xcodebuild destination string |
| `UI_AUTOMATION_DERIVED_DATA` | xcodebuild default | Derived data path |
| `UI_AUTOMATION_TIMEOUT` | `120` | Seconds before killing xcodebuild |

### Via xcodebuild directly

```bash
PAYLOAD_FILE=$(mktemp /tmp/payload.XXXXXX.json)
RESULT_FILE=$(mktemp /tmp/result.XXXXXX.json)
echo '{"action":"describe_ui"}' > "$PAYLOAD_FILE"

xcodebuild test \
  -project clients/native/apps/ios/PiNative.xcodeproj \
  -scheme "PiNative UITests" \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1" \
  -only-testing "PiNative UITests/AutomationBridgeHarness/testRunAction" \
  "UI_AUTOMATION_PAYLOAD_PATH=$PAYLOAD_FILE" \
  "UI_AUTOMATION_RESULT_PATH=$RESULT_FILE"

cat "$RESULT_FILE"
```

### Via pi-xcode `xcode_ui` tool (optional)

Use `runnerCommand` to hook the bridge into pi's `xcode_ui` tool:

```
runnerCommand: "bash tools/ui-automation-runner.sh"
```

pi-xcode will serialize the action and params to JSON and pass them as the first argument to the runner script.

## Troubleshooting

**`ELEMENT_NOT_FOUND` after timeout**  
The element's `accessibilityIdentifier` doesn't match what the bridge is querying. Use `describe_ui` first to inspect what identifiers are on screen.

**`ELEMENT_NOT_HITTABLE`**  
The element exists in the hierarchy but is off-screen, behind another view, or in a disabled state. Scroll to it or check the view's alpha/hidden properties.

**`PAYLOAD_READ_ERROR` / no result file**  
The env vars weren't passed to the test runner. Verify the scheme's TestAction has the `$(UI_AUTOMATION_PAYLOAD_PATH)` environment variable entries (regenerate with `xcodegen generate` if needed).

**Simulator not booted**  
Boot a simulator before running: `xcrun simctl boot "iPhone 17 Pro"`. Or set `UI_AUTOMATION_DESTINATION` to a named device.

**`xcodebuild` takes too long**  
The first run builds the app and test bundle; subsequent runs reuse the build cache. If you're always cold-building, set `UI_AUTOMATION_DERIVED_DATA` to a stable path.

**Test runs but app state is wrong**  
Each `testRunAction` invocation activates the app if it's already running (preserving state) or launches it fresh. If you need a clean state, terminate the app between runs: `xcrun simctl terminate booted <bundle-id>`.
