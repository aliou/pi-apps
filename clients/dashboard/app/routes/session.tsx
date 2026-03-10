import { ArrowLeftIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { FilePanel } from "../components/chat/file-panel";
import { ChatInput } from "../components/chat-input";
import { ConversationView } from "../components/conversation-view";
import { DebugView } from "../components/debug-view";
import { SandboxTerminal } from "../components/sandbox-terminal";
import { SessionHeader, type ViewMode } from "../components/session-header";

import {
  api,
  type ModelInfo,
  type ModelsResponse,
  RELAY_URL,
  type SandboxRestartResponse,
} from "../lib/api";
import { parseEventsToConversation } from "../lib/conversation";
import { useSidebar } from "../lib/sidebar";
import { useSandboxStatus } from "../lib/use-sandbox-status";
import { useSessionEvents } from "../lib/use-session-events";
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

  const {
    events,
    connectionStatus,
    error,
    setError,
    sendPrompt,
    setModel,
    getCommands,
    exportHtml,
    executeRpcCommand,
    session,
  } = useSessionEvents(id, initialPrompt);

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
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [commands, setCommands] = useState<
    Array<{ name: string; description?: string }>
  >([]);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [referencedPaths, setReferencedPaths] = useState<string[]>([]);

  useEffect(() => {
    navigate({ search: `?tab=${viewMode}` }, { replace: true });
  }, [viewMode, navigate]);

  useEffect(() => {
    let cancelled = false;

    api.get<ModelsResponse>("/models").then((res) => {
      if (cancelled) return;
      if (res.error) {
        setModelsError(res.error);
        return;
      }
      setModels(res.data?.models ?? []);
      setModelsError(null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    let cancelled = false;
    getCommands().then((result) => {
      if (cancelled) return;
      const normalized: Array<{ name: string; description?: string }> = [];
      for (const entry of result) {
        if (!entry || typeof entry !== "object") continue;
        const command = entry as Record<string, unknown>;
        const name = typeof command.name === "string" ? command.name : null;
        if (!name) continue;
        normalized.push({
          name,
          description:
            typeof command.description === "string"
              ? command.description
              : undefined,
        });
      }
      setCommands(normalized);
    });

    return () => {
      cancelled = true;
    };
  }, [connectionStatus, getCommands]);

  const capabilityWarnings = useMemo(() => {
    const capabilities = sandboxStatus?.capabilities;
    if (!capabilities) return [] as string[];

    const warnings: string[] = [];
    if (!capabilities.restart) {
      warnings.push("Sandbox provider does not support restart.");
    }
    if (!capabilities.terminal) {
      warnings.push("Sandbox provider does not expose terminal access.");
    }
    if (!capabilities.exec) {
      warnings.push(
        "Sandbox provider has limited exec support; setup actions may be deferred.",
      );
    }
    return warnings;
  }, [sandboxStatus?.capabilities]);

  const scrollToBottomRef = useRef<(() => void) | null>(null);

  const conversationItems = useMemo(
    () => parseEventsToConversation(events),
    [events],
  );

  useEffect(() => {
    const allReferences = conversationItems.flatMap((item) => {
      if (item.type === "assistant" || item.type === "user") {
        return item.fileReferences ?? [];
      }
      return [];
    });
    const uniqueReferences = Array.from(new Set(allReferences));
    setReferencedPaths(uniqueReferences);

    const lastReferenced = [...conversationItems].reverse().find((item) => {
      if (item.type === "assistant" || item.type === "user") {
        return (item.fileReferences?.length ?? 0) > 0;
      }
      return false;
    });

    if (lastReferenced?.type === "assistant" || lastReferenced?.type === "user") {
      setHighlightedPath(lastReferenced.fileReferences?.[0] ?? null);
      return;
    }

    setHighlightedPath(null);
  }, [conversationItems]);

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
        onShare={() => {
          if (!id) return;
          void api
            .post<{ url: string }>(`/sessions/${id}/share`, {})
            .then((res) => {
              if (!res.data?.url) {
                setError(res.error ?? "Failed to create share link");
                return;
              }
              const url = `${window.location.origin}${res.data.url}`;
              navigator.clipboard.writeText(url);
            });
        }}
        onExport={() => {
          if (!id) return;
          const outputPath = `/data/agent/exports/session-${id}.html`;
          void exportHtml(outputPath).then((result) => {
            if (!result.ok) {
              setError(result.error ?? "Export failed");
              return;
            }
            window.open(
              `${apiBase()}/sessions/${id}/export`,
              "_blank",
              "noopener,noreferrer",
            );
          });
        }}
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

      {session?.branchCreationDeferred && (
        <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-6 md:px-10">
          <div className="max-w-4xl mx-auto flex items-center gap-2 py-2 text-xs text-amber-500">
            <WarningIcon className="size-4 shrink-0" weight="fill" />
            Branch creation deferred: run `git checkout -b {session.branchName}`
            in sandbox terminal.
          </div>
        </div>
      )}

      {capabilityWarnings.length > 0 && (
        <div className="flex-shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-6 md:px-10">
          <div className="max-w-4xl mx-auto py-2 text-xs text-amber-500">
            {capabilityWarnings.join(" ")}
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex-1 flex overflow-hidden bg-bg",
          viewMode !== "chat" && "hidden",
        )}
      >
        <div className="flex-1 px-6 md:px-10 overflow-hidden">
          <div className="max-w-4xl mx-auto w-full h-full overflow-hidden">
            <ConversationView
              items={conversationItems}
              scrollToBottomRef={scrollToBottomRef}
            />
          </div>
        </div>
        {id && (
          <FilePanel
            sessionId={id}
            highlightedPath={highlightedPath}
            referencedPaths={referencedPaths}
          />
        )}
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
            <SandboxTerminal sessionId={id} sandboxStatus={sandboxStatus} />
          </div>
        </div>
      )}

      {viewMode === "chat" && (
        <ChatInput
          connectionStatus={connectionStatus}
          session={session}
          models={models}
          modelsError={modelsError}
          commands={commands}
          onSetModel={setModel}
          onRunSlashCommand={async (commandName) => {
            const result = await executeRpcCommand({ type: commandName });
            if (!result.ok) {
              setError(result.error ?? `/${commandName} failed`);
            }
            return result.ok;
          }}
          onSubmit={async (msg, options) => {
            sendPrompt(msg, options);
            requestAnimationFrame(() => scrollToBottomRef.current?.());
          }}
          error={error}
        />
      )}
    </div>
  );
}

function apiBase(): string {
  return `${RELAY_URL}/api`;
}
