/**
 * Creates pi tool definitions from native tool metadata.
 * Each tool delegates execution to the native client via WebSocket.
 *
 * Tools are displayed in UI exactly like built-in tools (e.g., "get_device_info ...")
 * not as "native_tool" calls.
 */

import type { TObject } from "@sinclair/typebox";
import type { NativeToolDefinition } from "../types";
import type { Connection } from "../ws/connection";

export interface NativeTool {
  name: string;
  label: string;
  description: string;
  parameters: TObject;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    onUpdate:
      | ((update: { content: Array<{ type: "text"; text: string }>; details: unknown }) => void)
      | undefined,
    ctx: unknown,
    signal?: AbortSignal,
  ) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    details: unknown;
  }>;
}

/**
 * Create pi-compatible tool definitions from connection's native tools.
 *
 * @param connection - WebSocket connection with native tools
 * @param sessionId - Session ID for event routing
 * @returns Array of tool definitions for createAgentSession
 */
export function createNativeTools(connection: Connection, sessionId: string): NativeTool[] {
  const tools: NativeTool[] = [];

  for (const def of connection.getNativeTools()) {
    tools.push(createNativeToolWrapper(connection, sessionId, def));
  }

  return tools;
}

function createNativeToolWrapper(
  connection: Connection,
  sessionId: string,
  def: NativeToolDefinition,
): NativeTool {
  return {
    name: def.name, // Uses actual tool name, not "native_tool"
    label: formatLabel(def.name),
    description: def.description,
    parameters: def.parameters as TObject,

    async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
      try {
        const result = await connection.callNativeTool(
          sessionId,
          def.name,
          params,
          signal, // Pass signal for cancellation
        );

        // Format result for LLM
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);

        return {
          content: [{ type: "text", text }],
          details: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}

function formatLabel(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
