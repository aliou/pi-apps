import type { JournalEvent } from "./api";

// Conversation item types for the chat view
export type ConversationItem =
  | { type: "user"; id: string; text: string; timestamp: string }
  | {
      type: "assistant";
      id: string;
      text: string;
      timestamp: string;
      streaming: boolean;
    }
  | { type: "thinking"; id: string; text: string; timestamp: string }
  | {
      type: "tool";
      id: string;
      name: string;
      args: string;
      output: string;
      status: "running" | "success" | "error";
      timestamp: string;
    }
  | { type: "system"; id: string; text: string; timestamp: string };

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

interface MessagePayload {
  role?: string;
  content?: string | ContentBlock[];
}

interface PromptPayload {
  message?: string;
}

interface ToolStartPayload {
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
}

interface ToolEndPayload {
  toolCallId?: string;
  toolName?: string;
  result?: { content?: Array<{ text?: string }> };
  isError?: boolean;
}

interface AssistantMessageEvent {
  type: string;
  delta?: string;
  content?: string;
  contentIndex?: number;
}

interface MessageUpdatePayload {
  message?: MessagePayload;
  assistantMessageEvent?: AssistantMessageEvent;
}

/**
 * Parse journal events into conversation items for the chat view.
 *
 * Uses the structured start/delta/end events from the RPC protocol:
 * - thinking_start / thinking_delta / thinking_end
 * - text_start / text_delta / text_end
 * - tool_execution_start / tool_execution_end
 *
 * Items appear in the timeline in the order they occur, so you get:
 * thinking -> text -> tool -> thinking -> text -> ...
 *
 * For history replay (full content array in message), blocks are processed
 * in array order.
 */
export function parseEventsToConversation(
  events: JournalEvent[],
): ConversationItem[] {
  const items: ConversationItem[] = [];
  const toolCalls = new Map<
    string,
    { name: string; args: string; output: string; status: string }
  >();

  let currentAssistantText = "";
  let currentThinkingText = "";
  let currentAssistantId: string | null = null;
  let currentTimestamp = "";
  let thinkingCounter = 0;
  let assistantChunkCounter = 0;

  const flushThinking = () => {
    if (currentThinkingText.trim()) {
      items.push({
        type: "thinking",
        id: `thinking-${thinkingCounter++}`,
        text: currentThinkingText.trim(),
        timestamp: currentTimestamp,
      });
    }
    currentThinkingText = "";
  };

  const flushAssistantText = (streaming: boolean) => {
    if (currentAssistantText.trim()) {
      items.push({
        type: "assistant",
        id: currentAssistantId ?? `assistant-chunk-${assistantChunkCounter++}`,
        text: currentAssistantText.trim(),
        timestamp: currentTimestamp,
        streaming,
      });
      // Advance id so next chunk is unique
      currentAssistantId = `assistant-chunk-${assistantChunkCounter++}`;
    }
    currentAssistantText = "";
  };

  const flushAll = (streaming: boolean) => {
    flushThinking();
    flushAssistantText(streaming);
  };

  const resetTurn = () => {
    currentAssistantText = "";
    currentThinkingText = "";
    currentAssistantId = null;
    currentTimestamp = "";
  };

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case "prompt": {
        flushAll(false);
        const p = payload as PromptPayload;
        if (p.message) {
          items.push({
            type: "user",
            id: `user-${event.seq}`,
            text: p.message,
            timestamp: event.createdAt,
          });
        }
        break;
      }

      case "message_start": {
        flushAll(false);
        currentAssistantId = `assistant-${event.seq}`;
        currentTimestamp = event.createdAt;
        resetTurn();
        currentAssistantId = `assistant-${event.seq}`;
        currentTimestamp = event.createdAt;
        break;
      }

      case "message_update": {
        const p = payload as MessageUpdatePayload;
        const evt = p.assistantMessageEvent;

        if (!currentAssistantId) {
          currentAssistantId = `assistant-${event.seq}`;
          currentTimestamp = event.createdAt;
        }

        if (evt) {
          switch (evt.type) {
            // Thinking lifecycle
            case "thinking_delta":
              if (evt.delta) currentThinkingText += evt.delta;
              break;
            case "thinking_end":
              // Use the final content if available, otherwise use accumulated deltas
              if (evt.content) currentThinkingText = evt.content;
              flushThinking();
              break;

            // Text lifecycle
            case "text_delta":
              if (evt.delta) currentAssistantText += evt.delta;
              break;
            case "text_end":
              if (evt.content) currentAssistantText = evt.content;
              flushAssistantText(false);
              break;

            // Ignore start events and others
            default:
              break;
          }
        }

        // Full content array from message snapshot (history replay).
        // Only process if there are no streaming events (avoid double-counting).
        if (!evt) {
          const msg = p.message;
          if (msg?.content) {
            if (typeof msg.content === "string") {
              currentAssistantText = msg.content;
            } else if (Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === "thinking" && block.thinking?.trim()) {
                  flushAssistantText(false);
                  currentThinkingText = block.thinking;
                  flushThinking();
                } else if (block.type === "text" && block.text?.trim()) {
                  flushThinking();
                  currentAssistantText = block.text;
                  flushAssistantText(false);
                }
              }
            }
          }
        }
        break;
      }

      case "message_end": {
        flushAll(false);
        break;
      }

      case "tool_execution_start": {
        flushAll(true);
        const p = payload as ToolStartPayload;
        if (p.toolCallId) {
          toolCalls.set(p.toolCallId, {
            name: p.toolName ?? "unknown",
            args: p.args ? JSON.stringify(p.args, null, 2) : "",
            output: "",
            status: "running",
          });
          items.push({
            type: "tool",
            id: `tool-${p.toolCallId}`,
            name: p.toolName ?? "unknown",
            args: p.args ? JSON.stringify(p.args, null, 2) : "",
            output: "",
            status: "running",
            timestamp: event.createdAt,
          });
        }
        break;
      }

      case "tool_execution_end": {
        const p = payload as ToolEndPayload;
        if (p.toolCallId) {
          const tool = toolCalls.get(p.toolCallId);
          if (tool) {
            tool.status = p.isError ? "error" : "success";
            const outputText = (
              p.result?.content?.map((c) => c.text).join("\n") ?? ""
            ).replace(/\n+$/, "");
            tool.output = outputText;
            toolCalls.set(p.toolCallId, tool);

            const idx = items.findIndex(
              (item) =>
                item.type === "tool" && item.id === `tool-${p.toolCallId}`,
            );
            if (idx >= 0) {
              items[idx] = {
                type: "tool",
                id: `tool-${p.toolCallId}`,
                name: tool.name,
                args: tool.args,
                output: outputText,
                status: p.isError ? "error" : "success",
                timestamp: event.createdAt,
              };
            }
          }
        }
        break;
      }

      case "agent_start": {
        items.push({
          type: "system",
          id: `system-${event.seq}`,
          text: "Agent started",
          timestamp: event.createdAt,
        });
        break;
      }

      case "agent_end": {
        flushAll(false);
        break;
      }

      case "response": {
        const p = payload as { command?: string; success?: boolean };
        if (p.command === "prompt" && p.success === false) {
          items.push({
            type: "system",
            id: `system-${event.seq}`,
            text: `Error: ${p.command} failed`,
            timestamp: event.createdAt,
          });
        }
        break;
      }
    }
  }

  // Flush any remaining (still streaming)
  flushAll(true);

  return items;
}
