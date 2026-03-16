import {
  ArchiveBoxIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  BugIcon,
  ChatCircleIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FilesIcon,
  ShareNetworkIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { SandboxStatusResponse, Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";

export type ViewMode = "chat" | "debug" | "terminal";

function SessionStatusBadge({
  session,
  connectionStatus,
  sandboxStatus,
}: {
  session: Session | null;
  connectionStatus: ConnectionStatus;
  sandboxStatus: SandboxStatusResponse | null;
}) {
  let label: string;
  let color: string;
  let dotClass: string;

  if (session?.status === "archived") {
    label = "Archived";
    color = "bg-muted/20 text-muted/60";
    dotClass = "bg-current";
  } else if (
    connectionStatus === "error" ||
    sandboxStatus?.status === "error"
  ) {
    label = "Error";
    color = "bg-status-err/20 text-status-err";
    dotClass = "bg-status-err";
  } else if (connectionStatus === "connecting") {
    label = "Connecting...";
    color = "bg-status-warn/20 text-status-warn";
    dotClass = "bg-status-warn animate-pulse";
  } else if (
    sandboxStatus?.status === "creating" ||
    session?.status === "creating"
  ) {
    label = "Starting...";
    color = "bg-status-warn/20 text-status-warn";
    dotClass = "bg-status-warn animate-pulse";
  } else if (connectionStatus === "connected") {
    const provider = sandboxStatus?.provider;
    label = provider ? `${provider}` : "Connected";
    color = "bg-status-ok/20 text-status-ok";
    dotClass = "bg-status-ok animate-pulse";
  } else {
    label = "Disconnected";
    color = "bg-muted/20 text-muted";
    dotClass = "bg-current";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
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
    <div className="flex items-center rounded-lg border border-border bg-surface p-0.5 md:w-auto">
      <button
        type="button"
        onClick={() => onChange("chat")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors md:px-3",
          mode === "chat"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <ChatCircleIcon className="h-4 w-4" />
        <span className="hidden md:inline">Chat</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("debug")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors md:px-3",
          mode === "debug"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <BugIcon className="h-4 w-4" />
        <span className="hidden md:inline">Debug</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("terminal")}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors md:px-3",
          mode === "terminal"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <TerminalWindowIcon className="h-4 w-4" />
        <span className="hidden md:inline">Terminal</span>
      </button>
    </div>
  );
}

export interface SessionHeaderProps {
  session: Session | null;
  sessionId: string | undefined;
  connectionStatus: ConnectionStatus;
  sandboxStatus: SandboxStatusResponse | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onShare: () => void;
  onExport: () => void;
  onToggleFiles: () => void;
  filePanelOpen: boolean;
  isArchiving: boolean;
  isDeleting: boolean;
  isRestarting: boolean;
}

function ActionItem({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors",
        danger ? "text-status-err hover:bg-status-err/10" : "text-fg hover:bg-surface",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SessionHeader({
  session,
  sessionId,
  connectionStatus,
  sandboxStatus,
  viewMode,
  onViewModeChange,
  onArchive,
  onDelete,
  onRestart,
  onShare,
  onExport,
  onToggleFiles,
  filePanelOpen,
  isArchiving,
  isDeleting,
  isRestarting,
}: SessionHeaderProps) {
  const canMutate = !!session && session.status !== "archived";
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <header className="relative z-20 flex-shrink-0 border-b border-border bg-surface px-4 py-3 md:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/sessions"
            className="-ml-1 p-1 text-muted transition-colors hover:text-fg"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-base font-semibold text-fg md:text-lg">
                {session?.name || sessionId?.slice(0, 8)}
              </h1>
              <SessionStatusBadge
                session={session}
                connectionStatus={connectionStatus}
                sandboxStatus={sandboxStatus}
              />
            </div>
            <p className="truncate text-xs text-muted">
              {session?.mode} session
              {session?.repoFullName
                ? ` - ${session.repoFullName}`
                : session?.repoId
                  ? ` - ${session.repoId}`
                  : ""}
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-end md:gap-3">
          <ViewToggle mode={viewMode} onChange={onViewModeChange} />

          <div ref={actionsRef} className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((prev) => !prev)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs font-medium text-muted transition-colors hover:text-fg"
              aria-expanded={actionsOpen}
              aria-label="Session actions"
            >
              <DotsThreeIcon className="size-4" weight="bold" />
              <span className="hidden sm:inline">Actions</span>
            </button>

            {actionsOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-bg p-1 shadow-xl">
                <ActionItem
                  label={filePanelOpen ? "Hide files" : "Show files"}
                  icon={<FilesIcon className="size-4" />}
                  onClick={() => {
                    onToggleFiles();
                    setActionsOpen(false);
                  }}
                />
                <ActionItem
                  label="Share"
                  icon={<ShareNetworkIcon className="size-4" />}
                  onClick={() => {
                    onShare();
                    setActionsOpen(false);
                  }}
                />
                <ActionItem
                  label="Export"
                  icon={<DownloadSimpleIcon className="size-4" />}
                  disabled={!canMutate}
                  onClick={() => {
                    if (!canMutate) return;
                    onExport();
                    setActionsOpen(false);
                  }}
                />
                <ActionItem
                  label="Restart"
                  icon={<ArrowClockwiseIcon className="size-4" />}
                  disabled={
                    !canMutate ||
                    sandboxStatus?.status === "creating" ||
                    sandboxStatus?.capabilities?.restart === false ||
                    isRestarting
                  }
                  onClick={() => {
                    if (
                      !canMutate ||
                      sandboxStatus?.status === "creating" ||
                      sandboxStatus?.capabilities?.restart === false ||
                      isRestarting
                    ) {
                      return;
                    }
                    onRestart();
                    setActionsOpen(false);
                  }}
                />
                <ActionItem
                  label="Archive"
                  icon={<ArchiveBoxIcon className="size-4" />}
                  disabled={!canMutate || isArchiving}
                  onClick={() => {
                    if (!canMutate || isArchiving) return;
                    onArchive();
                    setActionsOpen(false);
                  }}
                />
                {session?.status === "archived" ? (
                  <ActionItem
                    label="Delete"
                    icon={<TrashIcon className="size-4" />}
                    danger
                    disabled={isDeleting}
                    onClick={() => {
                      if (isDeleting) return;
                      onDelete();
                      setActionsOpen(false);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
