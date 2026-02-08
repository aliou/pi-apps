import type { SandboxStatus } from "../sandbox/types";

// Client -> Server (commands forwarded to pi)
// See: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
export type ClientCommand =
  // Prompting
  | {
      type: "prompt";
      message: string;
      id?: string;
      images?: unknown[];
      streamingBehavior?: "steer" | "followUp";
    }
  | { type: "steer"; message: string; id?: string }
  | { type: "follow_up"; message: string; id?: string }
  | { type: "abort"; id?: string }
  | { type: "new_session"; parentSession?: string; id?: string }
  // State
  | { type: "get_state"; id?: string }
  | { type: "get_messages"; id?: string }
  // Model
  | { type: "set_model"; provider: string; modelId: string; id?: string }
  | { type: "cycle_model"; id?: string }
  | { type: "get_available_models"; id?: string }
  // Thinking
  | {
      type: "set_thinking_level";
      level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
      id?: string;
    }
  | { type: "cycle_thinking_level"; id?: string }
  // Queue mode
  | {
      type: "set_steering_mode";
      mode: "all" | "one-at-a-time";
      id?: string;
    }
  | {
      type: "set_follow_up_mode";
      mode: "all" | "one-at-a-time";
      id?: string;
    }
  // Compaction
  | { type: "compact"; customInstructions?: string; id?: string }
  | { type: "set_auto_compaction"; enabled: boolean; id?: string }
  // Retry
  | { type: "set_auto_retry"; enabled: boolean; id?: string }
  | { type: "abort_retry"; id?: string }
  // Bash
  | { type: "bash"; command: string; id?: string }
  | { type: "abort_bash"; id?: string }
  // Session
  | { type: "get_session_stats"; id?: string }
  | { type: "export_html"; outputPath?: string; id?: string }
  | { type: "switch_session"; sessionPath: string; id?: string }
  | { type: "fork"; entryId: string; id?: string }
  | { type: "get_fork_messages"; id?: string }
  | { type: "get_last_assistant_text"; id?: string }
  | { type: "set_session_name"; name: string; id?: string }
  // Discovery
  | { type: "get_commands"; id?: string }
  // Extension UI response (forwarded to pi process)
  | {
      type: "extension_ui_response";
      id: string;
      value?: unknown;
      confirmed?: boolean;
      cancelled?: boolean;
    };

// All valid client command type strings.
// Keep in sync with RpcCommand from @mariozechner/pi-coding-agent.
const CLIENT_COMMAND_TYPES: ReadonlySet<string> = new Set([
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
]);

// Server -> Client (events from pi + server events)
export type ServerEvent =
  | { type: "connected"; sessionId: string; lastSeq: number }
  | { type: "replay_start"; fromSeq: number; toSeq: number }
  | { type: "replay_end" }
  | { type: "sandbox_status"; status: SandboxStatus; message?: string }
  | { type: "error"; code: string; message: string }
  | PiEvent;

// Pi events (agent -> client)
// See: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md
export type PiEvent =
  // Agent lifecycle
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  // Turn lifecycle
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: unknown;
      toolResults: unknown[];
    }
  // Message streaming
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; message: unknown; assistantMessageEvent: unknown }
  | { type: "message_end"; message: unknown }
  // Tool execution
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  // Compaction
  | {
      type: "auto_compaction_start";
      reason: "threshold" | "overflow";
    }
  | {
      type: "auto_compaction_end";
      result: unknown;
      aborted: boolean;
      willRetry: boolean;
      errorMessage?: string;
    }
  // Retry
  | {
      type: "auto_retry_start";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      errorMessage: string;
    }
  | {
      type: "auto_retry_end";
      success: boolean;
      attempt: number;
      finalError?: string;
    }
  // Extension errors
  | {
      type: "extension_error";
      extensionPath: string;
      event: string;
      error: string;
    }
  // Extension UI
  | {
      type: "extension_ui_request";
      id: string;
      method: string;
      [key: string]: unknown;
    }
  // RPC response
  | {
      type: "response";
      command: string;
      success: boolean;
      data?: unknown;
      error?: string;
      id?: string;
    };

// Type guards
export function isClientCommand(data: unknown): data is ClientCommand {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.type === "string" && CLIENT_COMMAND_TYPES.has(obj.type);
}
