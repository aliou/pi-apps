import type { JournalEvent } from "../lib/api";

interface EventItemProps {
  event: JournalEvent;
}

export function EventItem({ event }: EventItemProps) {
  const payload = event.payload as Record<string, unknown>;

  // Color coding by event type
  const getTypeColor = () => {
    switch (event.type) {
      case "agent_start":
      case "agent_end":
        return "text-blue-400";
      case "message_start":
      case "message_end":
        return "text-green-400";
      case "message_update":
        return "text-fg-muted";
      case "tool_execution_start":
        return "text-yellow-400";
      case "tool_execution_end":
        return "text-yellow-300";
      case "response":
        return "text-purple-400";
      case "error":
        return "text-red-400";
      default:
        return "text-fg-muted";
    }
  };

  // Render content based on event type
  const renderContent = () => {
    switch (event.type) {
      case "agent_start":
        return <span className="text-fg-muted">Starting...</span>;

      case "agent_end":
        return <span className="text-fg-muted">Complete</span>;

      case "message_start":
        return <span className="text-fg-muted">Message started</span>;

      case "message_update": {
        const message = payload.message as
          | { content?: Array<{ text?: string }> }
          | undefined;
        const text = message?.content?.[0]?.text ?? "";
        // Show last 100 chars for streaming updates
        const display = text.length > 100 ? `...${text.slice(-100)}` : text;
        return (
          <span className="text-fg whitespace-pre-wrap break-all">
            {display}
          </span>
        );
      }

      case "message_end": {
        const message = payload.message as
          | { content?: Array<{ text?: string }> }
          | undefined;
        const text = message?.content?.[0]?.text ?? "";
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        return (
          <span className="text-fg-muted">
            Message complete ({wordCount} words)
          </span>
        );
      }

      case "tool_execution_start": {
        const toolName = payload.toolName as string | undefined;
        return (
          <span className="text-fg">
            Tool: <span className="font-semibold">{toolName ?? "unknown"}</span>
          </span>
        );
      }

      case "tool_execution_end": {
        const toolName = payload.toolName as string | undefined;
        const isError = payload.isError as boolean | undefined;
        return (
          <span className={isError ? "text-red-400" : "text-fg-muted"}>
            {toolName ?? "unknown"} {isError ? "failed" : "complete"}
          </span>
        );
      }

      case "response": {
        const command = payload.command as string | undefined;
        const success = payload.success as boolean | undefined;
        return (
          <span className={success ? "text-fg-muted" : "text-red-400"}>
            {command}: {success ? "ok" : "error"}
          </span>
        );
      }

      default:
        return (
          <span className="text-fg-muted truncate">
            {JSON.stringify(payload).slice(0, 80)}
          </span>
        );
    }
  };

  const timestamp = new Date(event.createdAt).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex items-start gap-3 py-1 border-b border-border/50 last:border-b-0">
      <span className="text-fg-muted text-xs w-8 flex-shrink-0">
        {event.seq}
      </span>
      <span className="text-fg-muted text-xs w-16 flex-shrink-0">
        {timestamp}
      </span>
      <span
        className={`text-xs w-28 flex-shrink-0 font-mono ${getTypeColor()}`}
      >
        {event.type}
      </span>
      <div className="flex-1 text-sm overflow-hidden">{renderContent()}</div>
    </div>
  );
}
