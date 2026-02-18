#!/usr/bin/env bash
# ui-automation-runner.sh
#
# Runs a single UI automation action against the PiNative iOS app in the simulator.
#
# Usage:
#   tools/ui-automation-runner.sh '<json-payload>'
#
# Output:
#   Prints the result JSON to stdout. Exits 0 on success (ok=true), 1 on failure.
#
# Knobs (environment variables):
#   UI_AUTOMATION_SCHEME      Override test scheme           (default: "PiNative UITests")
#   UI_AUTOMATION_DESTINATION Override xcodebuild destination (default: booted simulator or iPhone 17 Pro iOS 26.1)
#   UI_AUTOMATION_DERIVED_DATA Override derived data path    (default: none, xcodebuild default)
#   UI_AUTOMATION_TIMEOUT     Seconds before xcodebuild kill (default: 120)
#
# pi-xcode integration (optional):
#   xcode_ui action: "tap" params: {identifier: "my-btn"}
#   runnerCommand: "bash tools/ui-automation-runner.sh"
#   (pi-xcode will serialize params to JSON and pass as first argument)

set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

if [[ $# -lt 1 || "$1" == "--help" || "$1" == "-h" ]]; then
  echo "Usage: tools/ui-automation-runner.sh '<json-payload>'"
  echo ""
  echo "Payload shape:"
  echo '  {"action":"describe_ui"}'
  echo '  {"action":"tap","params":{"identifier":"my-button"}}'
  echo '  {"action":"type","params":{"identifier":"username-field","text":"hello"}}'
  echo '  {"action":"query_text","params":{"text":"Submit","match":"contains"}}'
  echo '  {"action":"wait_for","params":{"identifier":"spinner","state":"absent","timeout":15}}'
  echo '  {"action":"assert","params":{"identifier":"submit-btn","exists":true,"hittable":true}}'
  exit 0
fi

PAYLOAD_JSON="$1"

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$REPO_ROOT/clients/native/apps/ios/PiNative.xcodeproj"
SCHEME="${UI_AUTOMATION_SCHEME:-PiNative UITests}"
ONLY_TESTING="PiNative UITests/AutomationBridgeHarness/testRunAction"
TIMEOUT="${UI_AUTOMATION_TIMEOUT:-120}"

# ---------------------------------------------------------------------------
# Temp files
# ---------------------------------------------------------------------------

PAYLOAD_FILE="$(mktemp /tmp/ui-automation-payload.XXXXXX.json)"
RESULT_FILE="$(mktemp /tmp/ui-automation-result.XXXXXX.json)"
# Ensure result file exists so xcodebuild can write to the path.
touch "$RESULT_FILE"

cleanup() {
  rm -f "$PAYLOAD_FILE" "$RESULT_FILE"
}
trap cleanup EXIT

echo "$PAYLOAD_JSON" > "$PAYLOAD_FILE"

# ---------------------------------------------------------------------------
# Simulator destination
# ---------------------------------------------------------------------------

if [[ -n "${UI_AUTOMATION_DESTINATION:-}" ]]; then
  DESTINATION="$UI_AUTOMATION_DESTINATION"
else
  # Prefer a booted iOS simulator; fall back to a named device.
  BOOTED_UDID="$(
    xcrun simctl list devices booted --json 2>/dev/null \
    | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    for rt, devs in d.get('devices', {}).items():
        if 'iOS' in rt:
            for dev in devs:
                if dev.get('state') == 'Booted':
                    print(dev['udid'])
                    sys.exit(0)
except Exception:
    pass
" 2>/dev/null || true
  )"

  if [[ -n "$BOOTED_UDID" ]]; then
    DESTINATION="id=$BOOTED_UDID"
  else
    DESTINATION="platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1"
  fi
fi

# ---------------------------------------------------------------------------
# Build-for-testing then run
# ---------------------------------------------------------------------------

declare -a DERIVED_DATA_ARGS=()
if [[ -n "${UI_AUTOMATION_DERIVED_DATA:-}" ]]; then
  DERIVED_DATA_ARGS=(-derivedDataPath "$UI_AUTOMATION_DERIVED_DATA")
fi

# Export env vars as belt-and-suspenders for runners that inherit the shell env.
export UI_AUTOMATION_PAYLOAD_PATH="$PAYLOAD_FILE"
export UI_AUTOMATION_RESULT_PATH="$RESULT_FILE"
export UI_AUTOMATION_PAYLOAD_JSON=""   # clear inline fallback when using file

XCODEBUILD_EXIT=0
# Suppress both stdout and stderr: result is read from $RESULT_FILE, not from xcodebuild's pipe.
xcodebuild test \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  -only-testing "$ONLY_TESTING" \
  ${DERIVED_DATA_ARGS[@]+"${DERIVED_DATA_ARGS[@]}"} \
  "UI_AUTOMATION_PAYLOAD_PATH=$PAYLOAD_FILE" \
  "UI_AUTOMATION_RESULT_PATH=$RESULT_FILE" \
  "UI_AUTOMATION_PAYLOAD_JSON=" \
  >/dev/null 2>&1 \
|| XCODEBUILD_EXIT=$?

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

if [[ -s "$RESULT_FILE" ]]; then
  RESULT_JSON="$(cat "$RESULT_FILE")"
  printf '%s\n' "$RESULT_JSON"
  # Exit non-zero if the action itself reported failure.
  python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    sys.exit(0 if d.get('ok') else 1)
except Exception:
    sys.exit(1)
" "$RESULT_JSON"
else
  # No result written — test invocation failed before the harness ran.
  ERROR_JSON="{\"ok\":false,\"action\":\"unknown\",\"errors\":[{\"message\":\"No result file produced (xcodebuild exit $XCODEBUILD_EXIT)\",\"code\":\"RUNNER_ERROR\",\"hint\":\"Run with 2>&1 to see full xcodebuild output.\"}]}"
  printf '%s\n' "$ERROR_JSON"
  exit 1
fi
