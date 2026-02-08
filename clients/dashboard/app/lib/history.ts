import type { SessionHistoryEntry } from "./api";

/**
 * Conversation item types for the chat view (from JSONL session history).
 * Extends the original ConversationItem with additional entry types.
 */
export type HistoryItem =
  | { type: "user"; id: string; text: string; timestamp: string }
  | { type: "assistant"; id: string; text: string; timestamp: string }
  | {
      type: "tool";
      id: string;
      name: string;
      args: string;
      output: string;
      status: "success" | "error";
      timestamp: string;
    }
  | { type: "system"; id: string; text: string; timestamp: string }
  | { type: "raw"; id: string; entry: SessionHistoryEntry };

interface MessageContent {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
  provider?: string;
  model?: string;
  timestamp?: number;
}

interface ToolUseBlock {
  type: "tool_use";
  id?: string;
  name?: string;
  input?: unknown;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id?: string;
  content?: Array<{ text?: string }>;
  is_error?: boolean;
}

/**
 * Extract text from a message's content field.
 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block: { type: string; text?: string }) =>
          block.type === "text" && block.text,
      )
      .map((block: { text: string }) => block.text)
      .join("\n");
  }
  return "";
}

/**
 * Parse JSONL session history entries into conversation items.
 *
 * Handles:
 * - type: "message" with role "user" / "assistant" / tool_use / tool_result
 * - type: "compaction" — shows summary as system message
 * - type: "model_change" — shows as system pill
 * - type: "thinking_level_change" — shows as system pill
 * - type: "session" (header) — skipped
 * - Everything else — rendered as raw JSON collapsible
 */
export function parseHistoryToConversation(
  entries: SessionHistoryEntry[],
): HistoryItem[] {
  const items: HistoryItem[] = [];

  // Track tool_use blocks from assistant messages to match with tool_results
  const toolUseMap = new Map<
    string,
    { name: string; args: string; timestamp: string }
  >();

  for (const entry of entries) {
    const id = entry.id ?? `entry-${items.length}`;
    const timestamp = entry.timestamp ?? "";

    switch (entry.type) {
      case "session":
        // Header entry — skip
        break;

      case "message": {
        const msg = entry.message as MessageContent | undefined;
        if (!msg?.role) break;

        if (msg.role === "user") {
          const text = extractText(msg.content);
          if (text) {
            items.push({ type: "user", id, text, timestamp });
          }
        } else if (msg.role === "assistant") {
          // Assistant messages may contain text blocks and tool_use blocks
          const content = msg.content;
          const textParts: string[] = [];

          if (typeof content === "string") {
            textParts.push(content);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                textParts.push(block.text as string);
              } else if (block.type === "tool_use") {
                const tu = block as unknown as ToolUseBlock;
                if (tu.id) {
                  toolUseMap.set(tu.id, {
                    name: tu.name ?? "unknown",
                    args: tu.input ? JSON.stringify(tu.input, null, 2) : "",
                    timestamp,
                  });
                }
              }
            }
          }

          const text = textParts.join("\n");
          if (text.trim()) {
            items.push({ type: "assistant", id, text, timestamp });
          }

          // Emit tool items for any tool_use blocks
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_use") {
                const tu = block as unknown as ToolUseBlock;
                if (tu.id) {
                  items.push({
                    type: "tool",
                    id: `tool-${tu.id}`,
                    name: tu.name ?? "unknown",
                    args: tu.input ? JSON.stringify(tu.input, null, 2) : "",
                    output: "",
                    status: "success",
                    timestamp,
                  });
                }
              }
            }
          }
        } else if (msg.role === "tool") {
          // Tool result message — update matching tool item
          const content = msg.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              const tr = block as unknown as ToolResultBlock;
              if (tr.type === "tool_result" && tr.tool_use_id) {
                const outputText =
                  tr.content?.map((c) => c.text).join("\n") ?? "";
                const isError = tr.is_error ?? false;

                // Find and update the matching tool item
                const idx = items.findIndex(
                  (item) =>
                    item.type === "tool" &&
                    item.id === `tool-${tr.tool_use_id}`,
                );
                if (idx >= 0) {
                  const existing = items[idx] as Extract<
                    HistoryItem,
                    { type: "tool" }
                  >;
                  items[idx] = {
                    ...existing,
                    output: outputText,
                    status: isError ? "error" : "success",
                  };
                }
              }
            }
          }
        }
        break;
      }

      case "compaction": {
        const summary = (entry.summary as string) ?? "Conversation compacted";
        items.push({
          type: "system",
          id,
          text: `Compaction: ${summary.slice(0, 200)}${summary.length > 200 ? "..." : ""}`,
          timestamp,
        });
        break;
      }

      case "model_change": {
        const provider = (entry.provider as string) ?? "";
        const modelId = (entry.modelId as string) ?? "";
        items.push({
          type: "system",
          id,
          text: `Model changed to ${provider}/${modelId}`,
          timestamp,
        });
        break;
      }

      case "thinking_level_change": {
        const level = (entry.thinkingLevel as string) ?? "";
        items.push({
          type: "system",
          id,
          text: `Thinking level: ${level}`,
          timestamp,
        });
        break;
      }

      case "branch_summary": {
        const summary = (entry.summary as string) ?? "Branch summary available";
        items.push({
          type: "system",
          id,
          text: `Branch: ${summary.slice(0, 200)}${summary.length > 200 ? "..." : ""}`,
          timestamp,
        });
        break;
      }

      default:
        // Unknown entry type — render as raw JSON
        items.push({ type: "raw", id, entry });
        break;
    }
  }

  return items;
}
