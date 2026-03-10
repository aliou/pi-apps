import { describe, expect, it } from "vitest";
import { isClientCommand } from "./types";

const ALLOWED_RPC_COMMANDS = [
  "prompt",
  "steer",
  "follow_up",
  "abort",
  "new_session",
  "get_state",
  "get_messages",
  "set_model",
  "cycle_model",
  "get_available_models",
  "set_thinking_level",
  "cycle_thinking_level",
  "set_steering_mode",
  "set_follow_up_mode",
  "compact",
  "set_auto_compaction",
  "set_auto_retry",
  "abort_retry",
  "bash",
  "abort_bash",
  "get_session_stats",
  "export_html",
  "switch_session",
  "fork",
  "get_fork_messages",
  "get_last_assistant_text",
  "set_session_name",
  "get_commands",
  "extension_ui_response",
] as const;

describe("ws protocol boundary", () => {
  it("accepts only vendored rpc command types", () => {
    for (const type of ALLOWED_RPC_COMMANDS) {
      expect(isClientCommand({ type })).toBe(true);
    }
  });

  it("rejects non-vendored custom command types", () => {
    expect(isClientCommand({ type: "upload_file" })).toBe(false);
    expect(isClientCommand({ type: "session_share" })).toBe(false);
    expect(isClientCommand({ type: "file_panel_open" })).toBe(false);
  });
});
