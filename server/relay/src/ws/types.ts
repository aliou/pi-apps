import type { SandboxStatus } from "../sandbox/types";
import type {
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
} from "./rpc-types.vendor";

// Re-export vendored types used by other modules
export type { RpcCommand, RpcExtensionUIRequest, RpcResponse };

// ============================================================================
// Client -> Server (commands forwarded to pi)
// ============================================================================

export type ClientCommand = RpcCommand | RpcExtensionUIResponse;

// All valid client command type strings.
// Derived from RpcCommand + extension UI response.
const CLIENT_COMMAND_TYPES: ReadonlySet<string> = new Set<
  RpcCommand["type"] | RpcExtensionUIResponse["type"]
>([
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

// ============================================================================
// Server -> Client (relay events + pi events)
// ============================================================================

export type ServerEvent =
  | { type: "connected"; sessionId: string; lastSeq: number }
  | { type: "replay_start"; fromSeq: number; toSeq: number }
  | { type: "replay_end" }
  | { type: "sandbox_status"; status: SandboxStatus; message?: string }
  | { type: "error"; code: string; message: string }
  | PiEvent;

// ============================================================================
// Pi events (agent -> client)
// ============================================================================

export type PiEvent =
  // Agent lifecycle
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  // Turn lifecycle
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
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
  | { type: "auto_compaction_start"; reason: "threshold" | "overflow" }
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
  // Extension UI (vendored discriminated union)
  | RpcExtensionUIRequest
  // RPC response (vendored discriminated union on command)
  | RpcResponse;

// ============================================================================
// Type guards
// ============================================================================

export function isClientCommand(data: unknown): data is ClientCommand {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.type === "string" && CLIENT_COMMAND_TYPES.has(obj.type);
}
