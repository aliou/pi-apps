import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  api,
  type ActivateResponse,
  type EventsResponse,
  getClientId,
  type JournalEvent,
  RELAY_URL,
  type Session,
  setClientCapabilities,
} from "./api";
import { mergeCanonicalEvents } from "./events";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

const ALL_EVENTS_FETCH_CHUNK = 1000;

async function fetchAllEventsUntilSeq(
  sessionId: string,
  targetSeq: number,
): Promise<JournalEvent[]> {
  const collected: JournalEvent[] = [];
  let cursor = 0;

  while (cursor < targetSeq) {
    const limit = Math.min(ALL_EVENTS_FETCH_CHUNK, targetSeq - cursor);
    const res = await api.get<EventsResponse>(
      `/sessions/${sessionId}/events?afterSeq=${cursor}&limit=${limit}`,
    );

    if (!res.data || res.data.events.length === 0) {
      break;
    }

    collected.push(...res.data.events);
    cursor = res.data.lastSeq;
  }

  return collected;
}

export function useSessionEvents(
  sessionId: string | undefined,
  initialPrompt: string | undefined,
): {
  events: JournalEvent[];
  connectionStatus: ConnectionStatus;
  error: string | null;
  setError: (e: string | null) => void;
  sendPrompt: (message: string) => boolean;
  session: Session | null;
} {
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const initialPromptSentRef = useRef(false);
  const wsReadyRef = useRef(false);
  const pendingInitialPromptRef = useRef<string | null>(null);
  const readinessProbeIdRef = useRef<string | null>(null);

  const pendingPromptKey = sessionId ? `pendingPrompt:${sessionId}` : null;

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
    if (!sessionId) return;
    setEvents([]);
    lastSeqRef.current = 0;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    api.get<Session>(`/sessions/${sessionId}`).then((res) => {
      if (res.data) {
        setSession(res.data);
      } else {
        setError(res.error ?? "Failed to load session");
      }
    });
  }, [sessionId]);

  const sendPrompt = useCallback((message: string): boolean => {
    if (!wsRef.current || !wsReadyRef.current) return false;

    wsRef.current.send(
      JSON.stringify({
        type: "prompt",
        message,
        id: crypto.randomUUID(),
      }),
    );

    const seq = lastSeqRef.current + 1;
    setEvents((prev) =>
      mergeCanonicalEvents(prev, [
        {
          seq,
          type: "prompt",
          payload: { type: "prompt", message },
          createdAt: new Date().toISOString(),
        },
      ]),
    );
    lastSeqRef.current = seq;
    return true;
  }, []);

  const flushPendingInitialPrompt = useCallback(() => {
    const pending = pendingInitialPromptRef.current;
    if (!pending || initialPromptSentRef.current) return;

    const sent = sendPrompt(pending);
    if (!sent) return;

    initialPromptSentRef.current = true;
    pendingInitialPromptRef.current = null;

    if (pendingPromptKey) {
      sessionStorage.removeItem(pendingPromptKey);
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [sendPrompt, pendingPromptKey, navigate, location.pathname]);

  const connectWebSocket = useCallback(async () => {
    if (!sessionId || !RELAY_URL) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    wsReadyRef.current = false;
    readinessProbeIdRef.current = null;
    setConnectionStatus("connecting");
    setError(null);

    // Get or generate persistent clientId
    const clientId = getClientId();

    const activateRes = await api.post<ActivateResponse>(
      `/sessions/${sessionId}/activate`,
      { clientId },
    );

    if (activateRes.error || !activateRes.data) {
      setConnectionStatus("error");
      setError(activateRes.error ?? "Failed to activate session");
      return;
    }

    // Register client capabilities after activation
    const capsRes = await setClientCapabilities(sessionId, clientId, {
      extensionUI: true,
    });
    if (capsRes.error) {
      console.warn("Failed to set client capabilities:", capsRes.error);
    }

    const activatedLastSeq = Math.max(
      lastSeqRef.current,
      activateRes.data.lastSeq,
    );
    const allEvents = await fetchAllEventsUntilSeq(sessionId, activatedLastSeq);
    setEvents((prev) => mergeCanonicalEvents(prev, allEvents));
    lastSeqRef.current = activatedLastSeq;

    const wsUrl = `${RELAY_URL.replace("http", "ws")}/ws/sessions/${sessionId}?clientId=${encodeURIComponent(clientId)}&lastSeq=${activatedLastSeq}`;
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
        setEvents((prev) => mergeCanonicalEvents(prev, [newEvent]));
        lastSeqRef.current = Math.max(lastSeqRef.current, seq);
      } catch {
        // Ignore parse errors
      }
    };
  }, [sessionId, flushPendingInitialPrompt]);

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

  return {
    events,
    connectionStatus,
    error,
    setError,
    sendPrompt,
    session,
  };
}
