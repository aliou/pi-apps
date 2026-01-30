import { useEffect, useRef } from "react";
import type { JournalEvent } from "../lib/api";
import { EventItem } from "./event-item";

interface EventListProps {
  events: JournalEvent[];
  autoScroll?: boolean;
}

export function EventList({ events, autoScroll = true }: EventListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(events.length);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (!autoScroll) return;

    // Only scroll if new events were added
    if (events.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = events.length;
  }, [events.length, autoScroll]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-fg-muted">No events yet</p>
        <p className="text-sm text-fg-muted mt-1">
          Events will appear here when the session receives prompts
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-border bg-surface font-mono text-sm max-h-[600px] overflow-y-auto"
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center gap-3 pb-2 mb-2 border-b border-border text-xs text-fg-muted uppercase tracking-wider">
          <span className="w-8">#</span>
          <span className="w-16">Time</span>
          <span className="w-28">Type</span>
          <span className="flex-1">Content</span>
        </div>

        {/* Events */}
        {events.map((event) => (
          <EventItem key={event.seq} event={event} />
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
