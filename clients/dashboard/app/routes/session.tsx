import {
  ArrowLeftIcon,
  BugIcon,
  ChatCircleIcon,
  PaperPlaneTiltIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ConversationView } from "../components/conversation-view";
import { DebugView } from "../components/debug-view";
import { StatusBadge } from "../components/status-badge";
import {
  api,
  type EventsResponse,
  type JournalEvent,
  RELAY_URL,
  type Session,
  type SessionHistoryResponse,
} from "../lib/api";
import type { HistoryItem } from "../lib/history";
import { parseHistoryToConversation } from "../lib/history";
import { useSidebar } from "../lib/sidebar";
import { cn } from "../lib/utils";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type ViewMode = "chat" | "debug";

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connecting: "bg-status-warn/20 text-status-warn",
    connected: "bg-status-ok/20 text-status-ok",
    disconnected: "bg-muted/20 text-muted",
    error: "bg-status-err/20 text-status-err",
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
        className={`w-1.5 h-1.5 rounded-full ${status === "connected" ? "bg-status-ok animate-pulse" : status === "connecting" ? "bg-status-warn animate-pulse" : "bg-current"}`}
      />
      {labels[status]}
    </span>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center bg-surface border border-border rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => onChange("chat")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
          mode === "chat"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <ChatCircleIcon className="w-4 h-4" />
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChange("debug")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
          mode === "debug"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <BugIcon className="w-4 h-4" />
        Debug
      </button>
    </div>
  );
}

/**
 * Fetch session history from the JSONL file on the server.
 */
async function fetchHistory(sessionId: string): Promise<HistoryItem[]> {
  const res = await api.get<SessionHistoryResponse>(
    `/sessions/${sessionId}/history`,
  );
  if (res.data) {
    return parseHistoryToConversation(res.data.entries);
  }
  return [];
}

export default function SessionPage() {
  const { id } = useParams();
  const { collapsed } = useSidebar();
  const [session, setSession] = useState<Session | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The conversation view shows history items from the JSONL file
  const conversationItems = historyItems;

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

  // Fetch initial session history from JSONL file
  useEffect(() => {
    if (!id) return;
    fetchHistory(id).then(setHistoryItems);
  }, [id]);

  // Also fetch initial events for the debug view
  useEffect(() => {
    if (!id) return;

    api.get<EventsResponse>(`/sessions/${id}/events?limit=500`).then((res) => {
      if (res.data) {
        setEvents(res.data.events);
        lastSeqRef.current = res.data.lastSeq;
      }
    });
  }, [id]);

  // Re-fetch history when a turn ends (full messages available in JSONL)
  const refreshHistory = useCallback(() => {
    if (!id) return;
    fetchHistory(id).then(setHistoryItems);
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

        // Handle meta events
        if (event.type === "connected") {
          lastSeqRef.current = event.lastSeq as number;
          return;
        }
        if (event.type === "replay_start" || event.type === "replay_end") {
          return;
        }

        // Append to events list (for debug view)
        const seq = (event.seq as number) ?? lastSeqRef.current + 1;
        const newEvent: JournalEvent = {
          seq,
          type: event.type as string,
          payload: event,
          createdAt: new Date().toISOString(),
        };
        setEvents((prev) => [...prev, newEvent]);
        lastSeqRef.current = seq;

        // Re-fetch history on turn boundaries (full messages now in JSONL)
        if (
          event.type === "turn_end" ||
          event.type === "agent_end" ||
          event.type === "message_end"
        ) {
          refreshHistory();
        }
      } catch {
        // Ignore parse errors
      }
    };
  }, [id, refreshHistory]);

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

  // Send prompt
  const handleSubmit = () => {
    if (!inputText.trim() || !wsRef.current || isSubmitting) return;

    const message = inputText.trim();
    setInputText("");
    setIsSubmitting(true);

    // Send prompt command over WebSocket
    wsRef.current.send(
      JSON.stringify({
        type: "prompt",
        message,
        id: crypto.randomUUID(),
      }),
    );

    // Add optimistic user message to conversation
    const optimisticId = `optimistic-${Date.now()}`;
    setHistoryItems((prev) => [
      ...prev,
      {
        type: "user" as const,
        id: optimisticId,
        text: message,
        timestamp: new Date().toISOString(),
      },
    ]);

    // Also add to debug events
    const seq = lastSeqRef.current + 1;
    setEvents((prev) => [
      ...prev,
      {
        seq,
        type: "prompt",
        payload: { type: "prompt", message },
        createdAt: new Date().toISOString(),
      },
    ]);
    lastSeqRef.current = seq;

    // Reset submitting state after a moment
    setTimeout(() => setIsSubmitting(false), 500);
  };

  // Handle textarea keyboard
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea - run when input changes
  const resizeTextarea = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: resize depends on inputText content
  useEffect(resizeTextarea, [inputText]);

  if (error && !session) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-status-err/20 bg-status-err/10 p-6 text-center">
          <p className="text-status-err">{error}</p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-2 text-sm text-muted hover:text-fg"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to sessions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-collapsed={collapsed || undefined}
      className="fixed inset-0 flex flex-col bg-bg z-10 md:left-64 md:data-[collapsed]:left-14"
    >
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-border bg-surface md:px-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-muted hover:text-fg transition-colors p-1 -ml-1"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-fg">
                  {session?.name || id?.slice(0, 8)}
                </h1>
                {session && <StatusBadge status={session.status} />}
                <ConnectionBadge status={connectionStatus} />
              </div>
              <p className="text-xs text-muted">
                {session?.mode} session
                {session?.repoId && ` - ${session.repoId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <span className="text-xs text-muted">{events.length} events</span>
          </div>
        </div>
      </header>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto bg-bg px-6 md:px-10">
        <div className="max-w-4xl mx-auto">
          {viewMode === "chat" ? (
            <ConversationView items={conversationItems} />
          ) : (
            <DebugView events={events} />
          )}
        </div>
      </div>

      {/* Input area (only in chat mode) */}
      {viewMode === "chat" && (
        <div className="flex-shrink-0 border-t border-border bg-surface px-6 py-4 md:px-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    connectionStatus === "connected"
                      ? "Type a message... (Enter to send, Shift+Enter for newline)"
                      : "Waiting for connection..."
                  }
                  disabled={connectionStatus !== "connected"}
                  rows={1}
                  className={cn(
                    "w-full resize-none rounded-xl border border-border bg-bg px-4 py-3 pr-10",
                    "text-sm text-fg placeholder:text-muted",
                    "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
                {inputText && (
                  <button
                    type="button"
                    onClick={() => setInputText("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-fg"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  !inputText.trim() ||
                  connectionStatus !== "connected" ||
                  isSubmitting
                }
                className={cn(
                  "flex-shrink-0 p-3 rounded-xl transition-colors",
                  "bg-accent text-accent-fg",
                  "hover:bg-accent-hover",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <PaperPlaneTiltIcon className="w-5 h-5" weight="fill" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
