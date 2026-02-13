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

interface MessageUpdatePayload {
  message?: MessagePayload;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
}

/**
 * Parse journal events into conversation items for the chat view.
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
  let currentAssistantId: string | null = null;
  let currentAssistantTimestamp = "";

  // Helper to flush current assistant message
  const flushAssistant = (streaming: boolean) => {
    if (currentAssistantId && currentAssistantText.trim()) {
      items.push({
        type: "assistant",
        id: currentAssistantId,
        text: currentAssistantText.trim(),
        timestamp: currentAssistantTimestamp,
        streaming,
      });
    }
    currentAssistantText = "";
    currentAssistantId = null;
    currentAssistantTimestamp = "";
  };

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      // User sent a prompt
      case "prompt": {
        flushAssistant(false);
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

      // Assistant message started
      case "message_start": {
        flushAssistant(false);
        currentAssistantId = `assistant-${event.seq}`;
        currentAssistantTimestamp = event.createdAt;
        currentAssistantText = "";
        break;
      }

      // Assistant message streaming update
      case "message_update": {
        const p = payload as MessageUpdatePayload;
        const evt = p.assistantMessageEvent;

        // If we don't have an active assistant message, create one
        if (!currentAssistantId) {
          currentAssistantId = `assistant-${event.seq}`;
          currentAssistantTimestamp = event.createdAt;
        }

        // Handle delta events
        if (evt?.type === "text_delta" && evt.delta) {
          currentAssistantText += evt.delta;
        }

        // Also try to get full text from message.content
        const msg = p.message;
        if (msg?.content) {
          if (typeof msg.content === "string") {
            currentAssistantText = msg.content;
          } else if (Array.isArray(msg.content)) {
            const textContent = msg.content.find(
              (c: ContentBlock) => c.type === "text",
            );
            if (textContent?.text) {
              currentAssistantText = textContent.text;
            }
          }
        }
        break;
      }

      // Assistant message ended
      case "message_end": {
        flushAssistant(false);
        break;
      }

      // Tool execution started
      case "tool_execution_start": {
        flushAssistant(true); // Keep assistant streaming while tools run
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

      // Tool execution ended
      case "tool_execution_end": {
        const p = payload as ToolEndPayload;
        if (p.toolCallId) {
          const tool = toolCalls.get(p.toolCallId);
          if (tool) {
            tool.status = p.isError ? "error" : "success";
            const outputText =
              p.result?.content?.map((c) => c.text).join("\n") ?? "";
            tool.output = outputText;
            toolCalls.set(p.toolCallId, tool);

            // Update the existing tool item
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

      // Agent lifecycle events
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
        flushAssistant(false);
        break;
      }

      // Response events (RPC responses)
      case "response": {
        const p = payload as { command?: string; success?: boolean };
        // Only show errors or important responses
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

  // Flush any remaining assistant message (still streaming)
  flushAssistant(true);

  return items;
}
