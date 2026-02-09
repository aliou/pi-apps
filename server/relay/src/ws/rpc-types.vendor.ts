/**
 * Vendored from pi-mono/packages/coding-agent/src/modes/rpc/rpc-types.ts
 *
 * These types mirror the upstream RPC protocol. Do not modify the shapes.
 * External type references (Model, AgentMessage, etc.) are replaced with
 * `unknown` since the relay only needs the discriminant fields.
 */

// ============================================================================
// Simplified external types (relay doesn't need full definitions)
// ============================================================================

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ============================================================================
// RPC Commands (stdin)
// ============================================================================

export type RpcCommand =
  // Prompting
  | {
      id?: string;
      type: "prompt";
      message: string;
      images?: unknown[];
      streamingBehavior?: "steer" | "followUp";
    }
  | { id?: string; type: "steer"; message: string; images?: unknown[] }
  | { id?: string; type: "follow_up"; message: string; images?: unknown[] }
  | { id?: string; type: "abort" }
  | { id?: string; type: "new_session"; parentSession?: string }

  // State
  | { id?: string; type: "get_state" }

  // Model
  | { id?: string; type: "set_model"; provider: string; modelId: string }
  | { id?: string; type: "cycle_model" }
  | { id?: string; type: "get_available_models" }

  // Thinking
  | { id?: string; type: "set_thinking_level"; level: ThinkingLevel }
  | { id?: string; type: "cycle_thinking_level" }

  // Queue modes
  | { id?: string; type: "set_steering_mode"; mode: "all" | "one-at-a-time" }
  | { id?: string; type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" }

  // Compaction
  | { id?: string; type: "compact"; customInstructions?: string }
  | { id?: string; type: "set_auto_compaction"; enabled: boolean }

  // Retry
  | { id?: string; type: "set_auto_retry"; enabled: boolean }
  | { id?: string; type: "abort_retry" }

  // Bash
  | { id?: string; type: "bash"; command: string }
  | { id?: string; type: "abort_bash" }

  // Session
  | { id?: string; type: "get_session_stats" }
  | { id?: string; type: "export_html"; outputPath?: string }
  | { id?: string; type: "switch_session"; sessionPath: string }
  | { id?: string; type: "fork"; entryId: string }
  | { id?: string; type: "get_fork_messages" }
  | { id?: string; type: "get_last_assistant_text" }
  | { id?: string; type: "set_session_name"; name: string }

  // Messages
  | { id?: string; type: "get_messages" }

  // Commands
  | { id?: string; type: "get_commands" };

// ============================================================================
// RPC State
// ============================================================================

export interface RpcSessionState {
  model?: unknown;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

// ============================================================================
// RPC Responses (stdout)
// ============================================================================

export type RpcResponse =
  | { id?: string; type: "response"; command: "prompt"; success: true }
  | { id?: string; type: "response"; command: "steer"; success: true }
  | { id?: string; type: "response"; command: "follow_up"; success: true }
  | { id?: string; type: "response"; command: "abort"; success: true }
  | {
      id?: string;
      type: "response";
      command: "new_session";
      success: true;
      data: { cancelled: boolean };
    }
  | {
      id?: string;
      type: "response";
      command: "get_state";
      success: true;
      data: RpcSessionState;
    }
  | {
      id?: string;
      type: "response";
      command: "set_model";
      success: true;
      data: unknown;
    }
  | {
      id?: string;
      type: "response";
      command: "cycle_model";
      success: true;
      data: unknown;
    }
  | {
      id?: string;
      type: "response";
      command: "get_available_models";
      success: true;
      data: { models: unknown[] };
    }
  | {
      id?: string;
      type: "response";
      command: "set_thinking_level";
      success: true;
    }
  | {
      id?: string;
      type: "response";
      command: "cycle_thinking_level";
      success: true;
      data: { level: ThinkingLevel } | null;
    }
  | {
      id?: string;
      type: "response";
      command: "set_steering_mode";
      success: true;
    }
  | {
      id?: string;
      type: "response";
      command: "set_follow_up_mode";
      success: true;
    }
  | {
      id?: string;
      type: "response";
      command: "compact";
      success: true;
      data: unknown;
    }
  | {
      id?: string;
      type: "response";
      command: "set_auto_compaction";
      success: true;
    }
  | {
      id?: string;
      type: "response";
      command: "set_auto_retry";
      success: true;
    }
  | { id?: string; type: "response"; command: "abort_retry"; success: true }
  | {
      id?: string;
      type: "response";
      command: "bash";
      success: true;
      data: unknown;
    }
  | { id?: string; type: "response"; command: "abort_bash"; success: true }
  | {
      id?: string;
      type: "response";
      command: "get_session_stats";
      success: true;
      data: unknown;
    }
  | {
      id?: string;
      type: "response";
      command: "export_html";
      success: true;
      data: { path: string };
    }
  | {
      id?: string;
      type: "response";
      command: "switch_session";
      success: true;
      data: { cancelled: boolean };
    }
  | {
      id?: string;
      type: "response";
      command: "fork";
      success: true;
      data: { text: string; cancelled: boolean };
    }
  | {
      id?: string;
      type: "response";
      command: "get_fork_messages";
      success: true;
      data: { messages: Array<{ entryId: string; text: string }> };
    }
  | {
      id?: string;
      type: "response";
      command: "get_last_assistant_text";
      success: true;
      data: { text: string | null };
    }
  | {
      id?: string;
      type: "response";
      command: "set_session_name";
      success: true;
    }
  | {
      id?: string;
      type: "response";
      command: "get_messages";
      success: true;
      data: { messages: unknown[] };
    }
  | {
      id?: string;
      type: "response";
      command: "get_commands";
      success: true;
      data: { commands: unknown[] };
    }
  | {
      id?: string;
      type: "response";
      command: string;
      success: false;
      error: string;
    };

// ============================================================================
// Extension UI Events (stdout)
// ============================================================================

export type RpcExtensionUIRequest =
  | {
      type: "extension_ui_request";
      id: string;
      method: "select";
      title: string;
      options: string[];
      timeout?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "confirm";
      title: string;
      message: string;
      timeout?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "input";
      title: string;
      placeholder?: string;
      timeout?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "editor";
      title: string;
      prefill?: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "notify";
      message: string;
      notifyType?: "info" | "warning" | "error";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setStatus";
      statusKey: string;
      statusText: string | undefined;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setWidget";
      widgetKey: string;
      widgetLines: string[] | undefined;
      widgetPlacement?: "aboveEditor" | "belowEditor";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setTitle";
      title: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "set_editor_text";
      text: string;
    };

// ============================================================================
// Extension UI Commands (stdin)
// ============================================================================

export type RpcExtensionUIResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };
