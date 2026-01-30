import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { EventList } from "../components/event-list";
import { StatusBadge } from "../components/status-badge";
import {
  api,
  type EventsResponse,
  type JournalEvent,
  RELAY_URL,
  type Session,
} from "../lib/api";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connecting: "bg-yellow-500/20 text-yellow-400",
    connected: "bg-green-500/20 text-green-400",
    disconnected: "bg-zinc-500/20 text-zinc-400",
    error: "bg-red-500/20 text-red-400",
  };

  const labels: Record<ConnectionStatus, string> = {
    connecting: "Connecting...",
    connected: "Live",
    disconnected: "Disconnected",
    error: "Error",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${colors[status]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === "connected" ? "bg-green-400 animate-pulse" : status === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-current"}`}
      />
      {labels[status]}
    </span>
  );
}

export default function SessionPage() {
  const { id } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Fetch session metadata
  useEffect(() => {
    if (!id) return;

    api.get<Session>(`/sessions/${id}`).then((res) => {
      if (res.data) {
        setSession(res.data);
      } else {
        setError(res.error ?? "Failed to load session");
      }
    });
  }, [id]);

  // Fetch initial events via REST
  useEffect(() => {
    if (!id) return;

    api.get<EventsResponse>(`/sessions/${id}/events?limit=100`).then((res) => {
      if (res.data) {
        setEvents(res.data.events);
        lastSeqRef.current = res.data.lastSeq;
      }
    });
  }, [id]);

  // Connect WebSocket for live updates
  const connectWebSocket = useCallback(() => {
    if (!id || !RELAY_URL) return;

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus("connecting");

    const wsUrl = `${RELAY_URL.replace("http", "ws")}/ws/sessions/${id}?lastSeq=${lastSeqRef.current}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      setError(null);
    };

    ws.onclose = (evt) => {
      setConnectionStatus("disconnected");
      wsRef.current = null;

      // Reconnect after 3 seconds unless it was a clean close
      if (evt.code !== 1000) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 3000);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("error");
      setError("WebSocket connection failed");
    };

    ws.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data as string) as Record<string, unknown>;

        // Skip meta events
        if (
          event.type === "replay_start" ||
          event.type === "replay_end" ||
          event.type === "connected"
        ) {
          if (event.type === "connected") {
            // Update lastSeq from server
            lastSeqRef.current = event.lastSeq as number;
          }
          return;
        }

        // Append to events list
        const newEvent: JournalEvent = {
          seq: lastSeqRef.current + 1,
          type: event.type as string,
          payload: event,
          createdAt: new Date().toISOString(),
        };
        setEvents((prev) => [...prev, newEvent]);
        lastSeqRef.current += 1;
      } catch {
        // Ignore parse errors
      }
    };
  }, [id]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [connectWebSocket]);

  if (error && !session) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <Link
            to="/"
            className="text-fg-muted hover:text-fg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold text-fg">
            {session?.name || id?.slice(0, 8)}
          </h1>
          {session && <StatusBadge status={session.status} />}
          <ConnectionBadge status={connectionStatus} />
        </div>
        <p className="text-sm text-fg-muted ml-9">
          {session?.mode} session
          {session?.repoId && ` - ${session.repoId}`}
        </p>
      </header>

      {/* Event list */}
      <EventList events={events} />

      {/* Footer info */}
      <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
        <span>{events.length} events</span>
        <span>Last seq: {lastSeqRef.current}</span>
      </div>
    </div>
  );
}
