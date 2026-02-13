import { CaretDownIcon, CaretRightIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import type { JournalEvent } from "../lib/api";
import { cn } from "../lib/utils";

interface DebugViewProps {
  events: JournalEvent[];
  autoScroll?: boolean;
}

type DebugItem =
  | { kind: "event"; event: JournalEvent }
  | { kind: "message-group"; group: MessageGroup }
  | { kind: "tool-group"; group: ToolGroup };

interface MessageGroup {
  id: string;
  startEvent: JournalEvent;
  updates: JournalEvent[];
  endEvent?: JournalEvent;
  forceClosed: boolean;
}

interface ToolGroup {
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
      events.length > prevLengthRef.current &&
      currentLastSeq > prevLastSeqRef.current;

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
        {items.map((item) => {
          if (item.kind === "event") {
            return (
              <DebugEventRow
                key={`event-${item.event.seq}`}
                event={item.event}
              />
            );
          }

          if (item.kind === "message-group") {
            return <MessageGroupRow key={item.group.id} group={item.group} />;
          }

          return <ToolGroupRow key={item.group.id} group={item.group} />;
        })}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

function buildDebugItems(events: JournalEvent[]): DebugItem[] {
  const items: DebugItem[] = [];
  let openMessageGroup: MessageGroup | null = null;
  let openToolGroup: ToolGroup | null = null;

  const closeOpenMessageGroup = (forceClosed: boolean) => {
    if (!openMessageGroup) return;

    if (openMessageGroup.updates.length === 0) {
      items.push({ kind: "event", event: openMessageGroup.startEvent });
      if (openMessageGroup.endEvent) {
        items.push({ kind: "event", event: openMessageGroup.endEvent });
      }
      openMessageGroup = null;
      return;
    }

    items.push({
      kind: "message-group",
      group: {
        ...openMessageGroup,
        forceClosed,
      },
    });
    openMessageGroup = null;
  };

  const closeOpenToolGroup = (forceClosed: boolean) => {
    if (!openToolGroup) return;
    items.push({
      kind: "tool-group",
      group: {
        ...openToolGroup,
        forceClosed,
      },
    });
    openToolGroup = null;
  };

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (!event) continue;

    if (event.type === "message_start") {
      closeOpenMessageGroup(true);

      if (!shouldGroupMessageStart(event)) {
        const nextEvent = events[i + 1];
        if (nextEvent && shouldMergeUserMessagePair(event, nextEvent)) {
          items.push({ kind: "event", event });
          i += 1;
          continue;
        }

        items.push({ kind: "event", event });
        continue;
      }

      openMessageGroup = {
        id: `message-${event.seq}`,
        startEvent: event,
        updates: [],
        forceClosed: false,
      };
      continue;
    }

    if (event.type === "message_update") {
      if (!openMessageGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openMessageGroup.updates.push(event);
      continue;
    }

    if (event.type === "message_end") {
      if (!openMessageGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openMessageGroup.endEvent = event;
      closeOpenMessageGroup(false);
      continue;
    }

    if (event.type === "tool_execution_start") {
      closeOpenToolGroup(true);
      openToolGroup = {
        id: `tool-${event.seq}`,
        startEvent: event,
        updates: [],
        forceClosed: false,
      };
      continue;
    }

    if (event.type === "tool_execution_update") {
      if (!openToolGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openToolGroup.updates.push(event);
      continue;
    }

    if (event.type === "tool_execution_end") {
      if (!openToolGroup) {
        items.push({ kind: "event", event });
        continue;
      }
      openToolGroup.endEvent = event;
      closeOpenToolGroup(false);
      continue;
    }

    closeOpenToolGroup(true);
    items.push({ kind: "event", event });
  }

  closeOpenToolGroup(true);
  closeOpenMessageGroup(true);

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
        <span className="w-10 text-muted flex-shrink-0">
          {group.startEvent.seq}
        </span>
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
            <p className="px-6 py-2 text-[11px] text-muted italic">
              No message_update events
            </p>
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

function ToolGroupRow({ group }: { group: ToolGroup }) {
  const [expanded, setExpanded] = useState(false);
  const startTime = formatTimestamp(group.startEvent.createdAt);
  const toolName = getToolName(group.startEvent);
  const preview = getToolGroupPreview(group.updates, group.endEvent);

  return (
    <div className="bg-surface/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-start gap-3 text-left hover:bg-surface-hover transition-colors"
      >
        <span className="w-10 text-muted flex-shrink-0">
          {group.startEvent.seq}
        </span>
        <span className="w-20 text-muted flex-shrink-0">{startTime}</span>
        <span className="w-36 flex-shrink-0 font-medium text-status-warn">
          <span className="flex items-center gap-1">
            {expanded ? (
              <CaretDownIcon className="w-3 h-3" />
            ) : (
              <CaretRightIcon className="w-3 h-3" />
            )}
            tool ({toolName})
          </span>
        </span>
        <span className="flex-1 text-muted truncate">
          {group.updates.length} updates - {preview}
          {group.forceClosed && " - force-closed"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/50 bg-bg-deep/40 divide-y divide-border/40">
          <DebugEventRow event={group.startEvent} nested />
          {group.updates.map((event) => (
            <DebugEventRow key={event.seq} event={event} nested />
          ))}
          {group.endEvent ? (
            <DebugEventRow event={group.endEvent} nested />
          ) : null}
        </div>
      )}
    </div>
  );
}

function DebugEventRow({
  event,
  nested = false,
}: {
  event: JournalEvent;
  nested?: boolean;
}) {
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
    <div
      className={cn(
        "hover:bg-surface-hover transition-colors",
        nested && "pl-4",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-start gap-3 text-left"
      >
        <span className="w-10 text-muted flex-shrink-0">{event.seq}</span>
        <span className="w-20 text-muted flex-shrink-0">{timestamp}</span>
        <span
          className={cn(
            "w-36 flex-shrink-0 font-medium",
            getTypeColor(event.type),
          )}
        >
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
          {getPayloadPreview(event)}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="relative bg-bg-deep rounded-lg p-3 overflow-hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="absolute top-2 right-2 z-10 p-1 rounded bg-surface hover:bg-surface-hover transition-colors"
              title="Copy payload"
            >
              <CopyIcon className="w-3.5 h-3.5 text-muted" />
            </button>
            {copied && (
              <span className="absolute top-2 right-10 z-10 text-[10px] text-status-ok">
                Copied!
              </span>
            )}
            <JsonPayloadCode payload={payloadStr} />
          </div>
        </div>
      )}
    </div>
  );
}

function JsonPayloadCode({ payload }: { payload: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void codeToHtml(payload, {
      lang: "json",
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    })
      .then((rendered) => {
        if (!cancelled) setHtml(rendered);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!html) {
    return (
      <pre className="text-[11px] text-fg overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-all pr-9">
        {payload}
      </pre>
    );
  }

  return (
    <div
      className="text-[11px] [&_.shiki]:!bg-transparent [&_.shiki]:overflow-x-auto [&_.shiki]:max-h-80 [&_.shiki]:overflow-y-auto [&_.shiki]:pr-9"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is generated from local JSON payload
      dangerouslySetInnerHTML={{ __html: html }}
    />
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
    case "tool_execution_update": {
      const delta = payload.delta as string | undefined;
      if (delta?.trim()) {
        const d = delta.trim();
        return `update: "${d.slice(0, 40)}${d.length > 40 ? "..." : ""}"`;
      }
      return "update";
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

function shouldGroupMessageStart(startEvent: JournalEvent): boolean {
  return getMessageRole(startEvent) === "assistant";
}

function shouldMergeUserMessagePair(
  startEvent: JournalEvent,
  endEvent: JournalEvent,
): boolean {
  if (startEvent.type !== "message_start" || endEvent.type !== "message_end") {
    return false;
  }

  if (
    getMessageRole(startEvent) !== "user" ||
    getMessageRole(endEvent) !== "user"
  ) {
    return false;
  }

  const startMessage = (startEvent.payload as { message?: unknown }).message;
  const endMessage = (endEvent.payload as { message?: unknown }).message;
  if (!startMessage || !endMessage) {
    return false;
  }

  return JSON.stringify(startMessage) === JSON.stringify(endMessage);
}

function getMessageRole(startEvent: JournalEvent): string {
  const payload = startEvent.payload as Record<string, unknown>;
  const role =
    (payload.role as string | undefined) ??
    (payload.assistantMessageEvent as { role?: string } | undefined)?.role ??
    (payload.message as { role?: string } | undefined)?.role;

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

function getToolName(startEvent: JournalEvent): string {
  const payload = startEvent.payload as Record<string, unknown>;
  return (payload.toolName as string | undefined) ?? "unknown";
}

function getToolGroupPreview(
  updates: JournalEvent[],
  endEvent?: JournalEvent,
): string {
  if (updates[0]) {
    return getPayloadPreview(updates[0]);
  }

  if (endEvent) {
    return getPayloadPreview(endEvent);
  }

  return "-";
}
