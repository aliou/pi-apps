import { CaretDownIcon, CaretRightIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JournalEvent } from "../lib/api";
import { cn } from "../lib/utils";

interface DebugViewProps {
  events: JournalEvent[];
  autoScroll?: boolean;
}

type DebugItem =
  | { kind: "event"; event: JournalEvent }
  | { kind: "message-group"; group: MessageGroup };

interface MessageGroup {
  id: string;
  startEvent: JournalEvent;
  updates: JournalEvent[];
  endEvent?: JournalEvent;
  forceClosed: boolean;
}

export function DebugView({ events, autoScroll = true }: DebugViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);
  const prevLastSeqRef = useRef(events[events.length - 1]?.seq ?? 0);

  const items = useMemo(() => buildDebugItems(events), [events]);

  useEffect(() => {
    if (!autoScroll) return;

    const currentLastSeq = events[events.length - 1]?.seq ?? 0;
    const appendedLiveEvent =
      events.length > prevLengthRef.current && currentLastSeq > prevLastSeqRef.current;

    if (appendedLiveEvent) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    prevLengthRef.current = events.length;
    prevLastSeqRef.current = currentLastSeq;
  }, [events, autoScroll]);

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
      <div className="sticky top-0 bg-surface border-b border-border px-3 py-2 flex items-center gap-3 text-muted uppercase tracking-wider text-[10px]">
        <span className="w-10">Seq</span>
        <span className="w-20">Time</span>
        <span className="w-36">Type</span>
        <span className="flex-1">Payload</span>
      </div>

      <div className="divide-y divide-border/50">
        {items.map((item) =>
          item.kind === "event" ? (
            <DebugEventRow key={`event-${item.event.seq}`} event={item.event} />
          ) : (
            <MessageGroupRow key={item.group.id} group={item.group} />
          ),
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

function buildDebugItems(events: JournalEvent[]): DebugItem[] {
  const items: DebugItem[] = [];
  let openGroup: MessageGroup | null = null;

  const closeOpenGroup = (forceClosed: boolean) => {
    if (!openGroup) return;
    items.push({
      kind: "message-group",
      group: {
        ...openGroup,
        forceClosed,
      },
    });
    openGroup = null;
  };

  for (const event of events) {
    if (event.type === "message_start") {
      closeOpenGroup(true);
      openGroup = {
        id: `message-${event.seq}`,
        startEvent: event,
        updates: [],
        forceClosed: false,
      };
      continue;
    }

    if (event.type === "message_update") {
      if (!openGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openGroup.updates.push(event);
      continue;
    }

    if (event.type === "message_end") {
      if (!openGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openGroup.endEvent = event;
      closeOpenGroup(false);
      continue;
    }

    items.push({ kind: "event", event });
  }

  closeOpenGroup(true);

  return items;
}

function MessageGroupRow({ group }: { group: MessageGroup }) {
  const [expanded, setExpanded] = useState(false);
  const startTime = formatTimestamp(group.startEvent.createdAt);
  const role = getMessageRole(group.startEvent);
  const preview = getMessageGroupPreview(group.updates);

  return (
    <div className="bg-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-start gap-3 text-left hover:bg-surface-hover transition-colors"
      >
        <span className="w-10 text-muted flex-shrink-0">{group.startEvent.seq}</span>
        <span className="w-20 text-muted flex-shrink-0">{startTime}</span>
        <span className="w-36 flex-shrink-0 font-medium text-status-ok">
          <span className="flex items-center gap-1">
            {expanded ? (
              <CaretDownIcon className="w-3 h-3" />
            ) : (
              <CaretRightIcon className="w-3 h-3" />
            )}
            message ({role})
          </span>
        </span>
        <span className="flex-1 text-muted truncate">
          {group.updates.length} updates - {preview}
          {group.forceClosed && " - force-closed"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-bg-deep/40">
          {group.updates.length === 0 ? (
            <p className="px-6 py-2 text-[11px] text-muted italic">No message_update events</p>
          ) : (
            <div className="divide-y divide-border/40">
              {group.updates.map((event) => (
                <DebugEventRow key={event.seq} event={event} nested />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DebugEventRow({ event, nested = false }: { event: JournalEvent; nested?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const timestamp = formatTimestamp(event.createdAt);
  const payloadStr = JSON.stringify(event.payload, null, 2);

  const handleCopy = () => {
    void navigator.clipboard.writeText(payloadStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("hover:bg-surface-hover transition-colors", nested && "pl-4")}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-start gap-3 text-left"
      >
        <span className="w-10 text-muted flex-shrink-0">{event.seq}</span>
        <span className="w-20 text-muted flex-shrink-0">{timestamp}</span>
        <span className={cn("w-36 flex-shrink-0 font-medium", getTypeColor(event.type))}>
          <span className="flex items-center gap-1">
            {expanded ? (
              <CaretDownIcon className="w-3 h-3" />
            ) : (
              <CaretRightIcon className="w-3 h-3" />
            )}
            {event.type}
          </span>
        </span>
        <span className="flex-1 text-muted truncate">{getPayloadPreview(event)}</span>
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
              <span className="absolute top-2 right-10 text-[10px] text-status-ok">Copied!</span>
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

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function getTypeColor(type: string): string {
  if (type.includes("error")) return "text-status-err";
  if (type.includes("start")) return "text-status-ok";
  if (type.includes("end")) return "text-status-info";
  if (type.includes("update")) return "text-muted";
  if (type === "prompt") return "text-accent";
  if (type === "response") return "text-status-info";
  if (type.includes("tool")) return "text-status-warn";
  return "text-fg";
}

function getPayloadPreview(event: JournalEvent): string {
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case "prompt": {
      const msg = payload.message as string | undefined;
      return msg ? `"${msg.slice(0, 60)}${msg.length > 60 ? "..." : ""}"` : "-";
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
}

function getMessageRole(startEvent: JournalEvent): string {
  const payload = startEvent.payload as Record<string, unknown>;
  const role =
    (payload.role as string | undefined) ??
    ((payload.assistantMessageEvent as { role?: string } | undefined)?.role ??
      (payload.message as { role?: string } | undefined)?.role);

  return role ?? "unknown";
}

function getMessageGroupPreview(updates: JournalEvent[]): string {
  for (const update of updates) {
    const payload = update.payload as Record<string, unknown>;
    const evt = payload.assistantMessageEvent as
      | { type?: string; delta?: string }
      | undefined;

    if (evt?.type === "text_delta" && evt.delta?.trim()) {
      const delta = evt.delta.trim();
      return `"${delta.slice(0, 60)}${delta.length > 60 ? "..." : ""}"`;
    }
  }

  return updates[0] ? getPayloadPreview(updates[0]) : "-";
}
