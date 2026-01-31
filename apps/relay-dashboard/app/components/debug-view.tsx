import { CaretDownIcon, CaretRightIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { JournalEvent } from "../lib/api";
import { cn } from "../lib/utils";

interface DebugViewProps {
  events: JournalEvent[];
  autoScroll?: boolean;
}

export function DebugView({ events, autoScroll = true }: DebugViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);

  useEffect(() => {
    if (!autoScroll) return;
    if (events.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = events.length;
  }, [events.length, autoScroll]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted">
        <p className="text-sm">No events yet</p>
        <p className="text-xs mt-1">Events will appear here in real-time</p>
      </div>
    );
  }

  return (
    <div className="font-mono text-xs">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b border-border px-3 py-2 flex items-center gap-3 text-muted uppercase tracking-wider text-[10px]">
        <span className="w-10">Seq</span>
        <span className="w-20">Time</span>
        <span className="w-36">Type</span>
        <span className="flex-1">Payload</span>
      </div>

      {/* Events */}
      <div className="divide-y divide-border/50">
        {events.map((event) => (
          <DebugEventRow key={event.seq} event={event} />
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

function DebugEventRow({ event }: { event: JournalEvent }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const timestamp = new Date(event.createdAt).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  const payloadStr = JSON.stringify(event.payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Color coding by event type category
  const getTypeColor = () => {
    const type = event.type;
    if (type.includes("error")) return "text-status-err";
    if (type.includes("start")) return "text-status-ok";
    if (type.includes("end")) return "text-status-info";
    if (type.includes("update")) return "text-muted";
    if (type === "prompt") return "text-accent";
    if (type === "response") return "text-status-info";
    if (type.includes("tool")) return "text-status-warn";
    return "text-fg";
  };

  // Preview of payload (collapsed view)
  const getPayloadPreview = () => {
    const payload = event.payload as Record<string, unknown>;

    switch (event.type) {
      case "prompt": {
        const msg = payload.message as string | undefined;
        return msg
          ? `"${msg.slice(0, 60)}${msg.length > 60 ? "..." : ""}"`
          : "-";
      }
      case "message_update": {
        const evt = payload.assistantMessageEvent as
          | { type?: string; delta?: string }
          | undefined;
        if (evt?.type === "text_delta" && evt.delta) {
          const d = evt.delta;
          return `text_delta: "${d.slice(0, 40)}${d.length > 40 ? "..." : ""}"`;
        }
        return evt?.type ?? "-";
      }
      case "tool_execution_start": {
        const name = payload.toolName as string | undefined;
        return name ?? "-";
      }
      case "tool_execution_end": {
        const name = payload.toolName as string | undefined;
        const isError = payload.isError as boolean | undefined;
        return `${name ?? "-"} ${isError ? "(error)" : "(ok)"}`;
      }
      case "response": {
        const cmd = payload.command as string | undefined;
        const success = payload.success as boolean | undefined;
        return `${cmd ?? "-"}: ${success ? "ok" : "error"}`;
      }
      default:
        return Object.keys(payload).slice(0, 3).join(", ") || "-";
    }
  };

  return (
    <div className={cn("hover:bg-surface-hover transition-colors")}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-start gap-3 text-left"
      >
        <span className="w-10 text-muted flex-shrink-0">{event.seq}</span>
        <span className="w-20 text-muted flex-shrink-0">{timestamp}</span>
        <span className={cn("w-36 flex-shrink-0 font-medium", getTypeColor())}>
          <span className="flex items-center gap-1">
            {expanded ? (
              <CaretDownIcon className="w-3 h-3" />
            ) : (
              <CaretRightIcon className="w-3 h-3" />
            )}
            {event.type}
          </span>
        </span>
        <span className="flex-1 text-muted truncate">
          {getPayloadPreview()}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="relative bg-bg-deep rounded-lg p-3 ml-[calc(10ch+3ch+36ch)] overflow-hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="absolute top-2 right-2 p-1 rounded bg-surface hover:bg-surface-hover transition-colors"
              title="Copy payload"
            >
              <CopyIcon className="w-3.5 h-3.5 text-muted" />
            </button>
            {copied && (
              <span className="absolute top-2 right-10 text-[10px] text-status-ok">
                Copied!
              </span>
            )}
            <pre className="text-[11px] text-fg overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-all">
              {payloadStr}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
