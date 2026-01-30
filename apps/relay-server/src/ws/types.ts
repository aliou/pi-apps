import type { SandboxStatus } from "../sandbox/types";

// Client -> Server (commands forwarded to pi)
export type ClientCommand =
  | { type: "prompt"; message: string; id?: string; images?: unknown[] }
  | { type: "abort"; id?: string }
  | { type: "get_state"; id?: string }
  | { type: "set_model"; provider: string; modelId: string; id?: string }
  | {
      type: "native_tool_response";
      toolCallId: string;
      result: unknown;
      isError: boolean;
      id?: string;
    };

// Server -> Client (events from pi + server events)
export type ServerEvent =
  | { type: "connected"; sessionId: string; lastSeq: number }
  | { type: "replay_start"; fromSeq: number; toSeq: number }
  | { type: "replay_end" }
  | { type: "sandbox_status"; status: SandboxStatus; message?: string }
  | { type: "error"; code: string; message: string }
  | PiEvent;

// Pi events (subset - see pi RPC docs for full list)
export type PiEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; message: unknown; assistantMessageEvent: unknown }
  | { type: "message_end"; message: unknown }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | {
      type: "native_tool_request";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
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
  return (
    typeof obj.type === "string" &&
    [
      "prompt",
      "abort",
      "get_state",
      "set_model",
      "native_tool_response",
    ].includes(obj.type)
  );
}
