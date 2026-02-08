/**
 * Native Bridge Extension for Pi
 *
 * Bridges native device tool calls to remote clients via
 * extension_ui_request / extension_ui_response.
 *
 * Instead of reading tool definitions from a file, the extension asks the
 * connected client for its available tools at lifecycle points:
 *   - before_agent_start: refresh tools before each agent turn
 *
 * This approach works identically on Docker and Cloudflare because it uses
 * only the pi RPC channel (stdin/stdout), not the filesystem.
 *
 * Loaded in sandboxes with: pi --mode rpc -e /path/to/native-bridge.ts
 */

import * as crypto from "node:crypto";
import * as readline from "node:readline";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const LOG_PREFIX = "[native-bridge]";
const TOOL_CALL_TIMEOUT_MS = 60_000;
const TOOLS_FETCH_TIMEOUT_MS = 5_000;

// ---- Types ----

interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface NativeToolResultEnvelope {
  ok: boolean;
  result?: unknown;
  error?: { message: string; code?: string };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// ---- State ----

const pendingRequests = new Map<string, PendingRequest>();
const registeredToolNames = new Set<string>();
/** Names of tools currently available on the client. */
let currentToolNames = new Set<string>();
let stdinReady = false;

// ---- Logging (stderr only) ----

function log(...args: unknown[]): void {
  console.error(LOG_PREFIX, ...args);
}

// ---- Stdout emission (JSON only) ----

function emitRequest(data: Record<string, unknown>): void {
  const json = JSON.stringify(data);
  process.stdout.write(`${json}\n`);
}

// ---- Stdin listener (single instance) ----

function setupStdinListener(): void {
  if (stdinReady) return;
  stdinReady = true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: undefined,
    terminal: false,
  });

  rl.on("line", (line: string) => {
    try {
      const data = JSON.parse(line);
      if (data.type !== "extension_ui_response") return;

      const pending = pendingRequests.get(data.id);
      if (!pending) return;

      pendingRequests.delete(data.id);
      clearTimeout(pending.timeout);

      if (data.cancelled) {
        pending.reject(new Error("Cancelled by client"));
      } else {
        pending.resolve(data.value);
      }
    } catch {
      // Not JSON or not relevant - ignore
    }
  });

  log("stdin listener ready");
}

// ---- Generic request/response ----

function sendRequest(
  method: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const id = crypto.randomUUID();

    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    pendingRequests.set(id, { resolve, reject, timeout });

    if (signal) {
      const onAbort = () => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          clearTimeout(timeout);
          reject(new Error("Aborted"));
        }
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    emitRequest({
      type: "extension_ui_request",
      id,
      method,
      ...params,
    });
  });
}

// ---- Fetch tools from client ----

async function fetchToolsFromClient(): Promise<NativeToolDefinition[]> {
  try {
    const response = (await sendRequest(
      "get_native_tools",
      {},
      TOOLS_FETCH_TIMEOUT_MS,
    )) as { tools?: NativeToolDefinition[] } | undefined;

    if (!response || !Array.isArray(response.tools)) {
      log("client returned no tools or invalid format");
      return [];
    }

    return response.tools;
  } catch (err) {
    log("failed to fetch tools from client:", err);
    return [];
  }
}

// ---- Native tool call ----

function nativeToolCall(
  toolName: string,
  args: unknown,
  signal?: AbortSignal,
): Promise<NativeToolResultEnvelope> {
  return sendRequest(
    "native_tool_call",
    { toolName, args },
    TOOL_CALL_TIMEOUT_MS,
    signal,
  ) as Promise<NativeToolResultEnvelope>;
}

// ---- Tool registration ----

function toTypeBox(
  parameters: Record<string, unknown>,
): ReturnType<typeof Type.Unsafe> {
  if (!parameters || Object.keys(parameters).length === 0) {
    return Type.Object({});
  }
  return Type.Unsafe(parameters);
}

function registerTools(pi: ExtensionAPI, tools: NativeToolDefinition[]): void {
  // Update current availability set
  currentToolNames = new Set(tools.map((t) => t.name));

  for (const tool of tools) {
    if (registeredToolNames.has(tool.name)) continue;

    try {
      pi.registerTool({
        name: tool.name,
        description: tool.description,
        parameters: toTypeBox(tool.parameters),
        async execute(_toolCallId, params, _onUpdate, _ctx, signal) {
          // Soft-disable: tool was registered but client no longer reports it
          if (!currentToolNames.has(tool.name)) {
            throw new Error(
              `Tool "${tool.name}" is no longer available on the connected device.`,
            );
          }

          const envelope = await nativeToolCall(tool.name, params, signal);

          if (!envelope || !envelope.ok) {
            throw new Error(
              envelope?.error?.message ?? "Native tool call failed",
            );
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(envelope.result, null, 2),
              },
            ],
            details: envelope.result,
          };
        },
      });

      registeredToolNames.add(tool.name);
      log(`registered tool: ${tool.name}`);
    } catch (err) {
      log(`failed to register tool ${tool.name}:`, err);
    }
  }
}

// ---- Extension entry point ----

export default function (pi: ExtensionAPI): void {
  log("loading...");

  setupStdinListener();

  // Refresh tools before each agent turn. The client is guaranteed to be
  // connected at this point because it just sent a prompt.
  pi.on("before_agent_start", async () => {
    log("before_agent_start: requesting tools from client...");
    const tools = await fetchToolsFromClient();
    log(`received ${tools.length} tool(s) from client`);
    registerTools(pi, tools);
  });

  log("ready");
}
