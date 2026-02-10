import {
  ArchiveBoxIcon,
  ArrowLeftIcon,
  BugIcon,
  ChatCircleIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ConversationView } from "../components/conversation-view";
import { DebugView } from "../components/debug-view";
import { StatusBadge } from "../components/status-badge";
import {
  api,
  type ActivateResponse,
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

type LocationState = {
  initialPrompt?: string;
};

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

async function fetchHistory(sessionId: string): Promise<HistoryItem[]> {
  const res = await api.get<SessionHistoryResponse>(`/sessions/${sessionId}/history`);
  if (res.data) {
    return parseHistoryToConversation(res.data.entries);
  }
  return [];
}

export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [sandboxStatus, setSandboxStatus] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialPromptSentRef = useRef(false);
  const wsReadyRef = useRef(false);
  const pendingInitialPromptRef = useRef<string | null>(null);
  const readinessProbeIdRef = useRef<string | null>(null);

  const conversationItems = historyItems;

  const locationState = (location.state as LocationState | null) ?? null;
  const initialPrompt = locationState?.initialPrompt?.trim();
  const pendingPromptKey = id ? `pendingPrompt:${id}` : null;

  useEffect(() => {
    if (initialPrompt && !initialPromptSentRef.current) {
      pendingInitialPromptRef.current = initialPrompt;
      return;
    }

    if (!pendingPromptKey || initialPromptSentRef.current) return;
    const fromStorage = sessionStorage.getItem(pendingPromptKey)?.trim();
    if (fromStorage) {
      pendingInitialPromptRef.current = fromStorage;
    }
  }, [initialPrompt, pendingPromptKey]);

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

  useEffect(() => {
    if (!id) return;
    fetchHistory(id).then(setHistoryItems);
  }, [id]);

  useEffect(() => {
    if (!id) return;

    api.get<EventsResponse>(`/sessions/${id}/events?limit=500`).then((res) => {
      if (res.data) {
        setEvents(res.data.events);
        lastSeqRef.current = res.data.lastSeq;
      }
    });
  }, [id]);

  const refreshHistory = useCallback(() => {
    if (!id) return;
    fetchHistory(id).then(setHistoryItems);
  }, [id]);

  const sendPrompt = useCallback(
    (message: string, optimistic = true): boolean => {
      if (!wsRef.current || !wsReadyRef.current) return false;

      wsRef.current.send(
        JSON.stringify({
          type: "prompt",
          message,
          id: crypto.randomUUID(),
        }),
      );

      if (optimistic) {
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
      }

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
      return true;
    },
    [],
  );

  const flushPendingInitialPrompt = useCallback(() => {
    const pending = pendingInitialPromptRef.current;
    if (!pending || initialPromptSentRef.current) return;

    const sent = sendPrompt(pending, true);
    if (!sent) return;

    initialPromptSentRef.current = true;
    pendingInitialPromptRef.current = null;

    if (pendingPromptKey) {
      sessionStorage.removeItem(pendingPromptKey);
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [sendPrompt, pendingPromptKey, navigate, location.pathname]);

  const connectWebSocket = useCallback(async () => {
    if (!id || !RELAY_URL) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    wsReadyRef.current = false;
    readinessProbeIdRef.current = null;
    setConnectionStatus("connecting");
    setError(null);

    const activateRes = await api.post<ActivateResponse>(
      `/sessions/${id}/activate`,
      {},
    );

    if (activateRes.error || !activateRes.data) {
      setConnectionStatus("error");
      setError(activateRes.error ?? "Failed to activate session");
      return;
    }

    setSandboxStatus(activateRes.data.sandboxStatus);
    lastSeqRef.current = Math.max(lastSeqRef.current, activateRes.data.lastSeq);

    const wsUrl = `${RELAY_URL.replace("http", "ws")}/ws/sessions/${id}?lastSeq=${lastSeqRef.current}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connecting");
      setError(null);
    };

    ws.onclose = (evt) => {
      wsReadyRef.current = false;
      readinessProbeIdRef.current = null;
      setConnectionStatus("disconnected");
      wsRef.current = null;

      if (evt.code !== 1000) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          void connectWebSocket();
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

        if (event.type === "connected") {
          wsReadyRef.current = true;
          setConnectionStatus("connected");
          lastSeqRef.current = event.lastSeq as number;

          const pending = pendingInitialPromptRef.current;
          if (pending && !initialPromptSentRef.current && wsRef.current) {
            const probeId = crypto.randomUUID();
            readinessProbeIdRef.current = probeId;
            wsRef.current.send(
              JSON.stringify({
                type: "get_state",
                id: probeId,
              }),
            );
          }

          return;
        }
        if (
          event.type === "response" &&
          event.command === "get_state" &&
          event.success === true &&
          typeof event.id === "string" &&
          event.id === readinessProbeIdRef.current
        ) {
          readinessProbeIdRef.current = null;
          flushPendingInitialPrompt();
          return;
        }

        if (event.type === "replay_start" || event.type === "replay_end") {
          return;
        }

        const seq = (event.seq as number) ?? lastSeqRef.current + 1;
        const newEvent: JournalEvent = {
          seq,
          type: event.type as string,
          payload: event,
          createdAt: new Date().toISOString(),
        };
        setEvents((prev) => [...prev, newEvent]);
        lastSeqRef.current = seq;

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
  }, [id, refreshHistory, flushPendingInitialPrompt]);

  useEffect(() => {
    void connectWebSocket();

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


  const handleSubmit = () => {
    if (!inputText.trim() || !wsRef.current || isSubmitting) return;

    const message = inputText.trim();
    setInputText("");
    setIsSubmitting(true);

    const sent = sendPrompt(message, true);
    if (!sent) {
      setIsSubmitting(false);
      return;
    }
    setTimeout(() => setIsSubmitting(false), 500);
  };

  const handleArchive = async () => {
    if (!id || !session || session.status === "archived") return;
    if (!confirm("Archive this session?")) return;

    setIsArchiving(true);
    const res = await api.post<{ ok: true }>(`/sessions/${id}/archive`, {});
    setIsArchiving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    navigate("/");
  };

  const handleDelete = async () => {
    if (!id || !session || session.status !== "archived") return;
    if (!confirm("Delete this archived session permanently?")) return;

    setIsDeleting(true);
    const res = await api.delete<{ ok: true }>(`/sessions/${id}`);
    setIsDeleting(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    navigate("/");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

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
            Back to home
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
                {sandboxStatus && (
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted">
                    sandbox: {sandboxStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {session?.mode} session
                {session?.repoFullName
                  ? ` - ${session.repoFullName}`
                  : session?.repoId
                    ? ` - ${session.repoId}`
                    : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleArchive}
              disabled={!session || session.status === "archived" || isArchiving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
            >
              <ArchiveBoxIcon className="size-4" />
              Archive
            </button>
            {session?.status === "archived" && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-status-err/30 px-2.5 py-1.5 text-xs text-status-err hover:bg-status-err/10 disabled:opacity-50"
              >
                <TrashIcon className="size-4" />
                Delete
              </button>
            )}
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <span className="text-xs text-muted">{events.length} events</span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-bg px-6 md:px-10">
        <div className="max-w-4xl mx-auto">
          {viewMode === "chat" ? (
            <ConversationView items={conversationItems} />
          ) : (
            <DebugView events={events} />
          )}
        </div>
      </div>

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
                  disabled={
                    connectionStatus !== "connected" || session?.status === "archived"
                  }
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
                  isSubmitting ||
                  session?.status === "archived"
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
            {error && (
              <p className="mt-2 text-xs text-status-err">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
