import { ArrowLeftIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { ConversationView } from "../components/conversation-view";
import { DebugView } from "../components/debug-view";
import { SandboxTerminal } from "../components/sandbox-terminal";
import { ChatInput } from "../components/chat-input";
import { SessionHeader, type ViewMode } from "../components/session-header";

import {
  api,
  type SandboxRestartResponse,
} from "../lib/api";
import { parseEventsToConversation } from "../lib/conversation";
import { useSandboxStatus } from "../lib/use-sandbox-status";
import { useSessionEvents } from "../lib/use-session-events";
import { useSidebar } from "../lib/sidebar";
import { cn } from "../lib/utils";

type LocationState = {
  initialPrompt?: string;
};

export default function SessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { collapsed } = useSidebar();

  const locationState = (location.state as LocationState | null) ?? null;
  const initialPrompt = locationState?.initialPrompt?.trim();

  const { events, connectionStatus, error, setError, sendPrompt, session } =
    useSessionEvents(id, initialPrompt);

  const sandboxStatus = useSandboxStatus(id);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const tab = searchParams.get("tab");
    return tab === "chat" || tab === "debug" || tab === "terminal"
      ? tab
      : "chat";
  });

  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  useEffect(() => {
    navigate({ search: `?tab=${viewMode}` }, { replace: true });
  }, [viewMode, navigate]);

  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const conversationItems = useMemo(
    () => parseEventsToConversation(events),
    [events],
  );

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

    navigate("/sessions");
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

    navigate("/sessions");
  };

  const handleRestart = async () => {
    if (!id || !session || session.status === "archived") return;

    setIsRestarting(true);
    const res = await api.post<SandboxRestartResponse>(
      `/sessions/${id}/restart`,
      {},
    );
    setIsRestarting(false);

    if (res.error) {
      setError(res.error);
    }
  };

  if (error && !session) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-lg border border-status-err/20 bg-status-err/10 p-6 text-center">
          <p className="text-status-err">{error}</p>
          <Link
            to="/sessions"
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
      <SessionHeader
        session={session}
        sessionId={id}
        connectionStatus={connectionStatus}
        sandboxStatus={sandboxStatus}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onArchive={() => void handleArchive()}
        onDelete={() => void handleDelete()}
        onRestart={() => void handleRestart()}
        isArchiving={isArchiving}
        isDeleting={isDeleting}
        isRestarting={isRestarting}
        collapsed={collapsed}
      />

      {session?.extensionsStale && (
        <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-6 md:px-10">
          <div className="max-w-4xl mx-auto flex items-center gap-2 py-2 text-xs text-amber-500">
            <WarningIcon className="size-4 shrink-0" weight="fill" />
            Extension configuration changed. Restart the session to apply.
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden bg-bg px-6 md:px-10",
          viewMode !== "chat" && "hidden",
        )}
      >
        <div className="max-w-4xl mx-auto w-full flex-1 overflow-hidden">
          <ConversationView items={conversationItems} scrollToBottomRef={scrollToBottomRef} />
        </div>
      </div>
      <div
        className={cn(
          "flex-1 overflow-y-auto bg-bg px-6 md:px-10",
          viewMode !== "debug" && "hidden",
        )}
      >
        <div className="max-w-4xl mx-auto py-4">
          <DebugView events={events} autoScroll={false} />
        </div>
      </div>
      {viewMode === "terminal" && id && (
        <div className="flex-1 overflow-y-auto bg-bg px-6 md:px-10">
          <div className="max-w-4xl mx-auto py-4 h-full">
            <SandboxTerminal
              sessionId={id}
              sandboxStatus={sandboxStatus}
            />
          </div>
        </div>
      )}

      {viewMode === "chat" && (
        <ChatInput
          connectionStatus={connectionStatus}
          session={session}
          onSubmit={(msg) => {
            sendPrompt(msg);
            // Scroll to bottom after sending so user sees their message + response
            requestAnimationFrame(() => scrollToBottomRef.current?.());
          }}
          error={error}
        />
      )}
    </div>
  );
}
