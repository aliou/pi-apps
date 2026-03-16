import {
  ArchiveBoxIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  BugIcon,
  ChatCircleIcon,
  DownloadSimpleIcon,
  ShareNetworkIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";
import type { SandboxStatusResponse, Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export type ViewMode = "chat" | "debug" | "terminal";

/**
 * Unified status badge. Collapses session status, WS connection, and sandbox
 * state into a single indicator so the header doesn't overflow with badges.
 *
 * Priority: archived > error > connecting > sandbox status > connected.
 */
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
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${color}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
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
        <ChatCircleIcon className="w-4 h-4" />
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
        <BugIcon className="w-4 h-4" />
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
        <TerminalWindowIcon className="w-4 h-4" />
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
  isArchiving: boolean;
  isDeleting: boolean;
  isRestarting: boolean;
  collapsed: boolean;
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
  isArchiving,
  isDeleting,
  isRestarting,
}: SessionHeaderProps) {
  return (
    <header className="flex-shrink-0 border-b border-border bg-surface px-4 py-3 md:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/sessions"
            className="text-muted hover:text-fg transition-colors p-1 -ml-1"
          >
            <ArrowLeftIcon className="w-5 h-5" />
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

        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end md:gap-3">
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted hover:text-fg md:px-2.5"
          >
            <ShareNetworkIcon className="size-4" />
            <span className="hidden md:inline">Share</span>
            <span className="sr-only md:hidden">Share</span>
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!session || session.status === "archived"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted hover:text-fg disabled:opacity-50 md:px-2.5"
          >
            <DownloadSimpleIcon className="size-4" />
            <span className="hidden md:inline">Export</span>
            <span className="sr-only md:hidden">Export</span>
          </button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 px-2 md:px-3"
            onClick={onRestart}
            disabled={
              !session ||
              session.status === "archived" ||
              sandboxStatus?.status === "creating" ||
              sandboxStatus?.capabilities?.restart === false ||
              isRestarting
            }
            loading={isRestarting}
          >
            <ArrowClockwiseIcon className="size-4" />
            <span className="hidden md:inline">Restart</span>
            <span className="sr-only md:hidden">Restart</span>
          </Button>
          <button
            type="button"
            onClick={onArchive}
            disabled={!session || session.status === "archived" || isArchiving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-xs text-muted hover:text-fg disabled:opacity-50 md:px-2.5"
          >
            <ArchiveBoxIcon className="size-4" />
            <span className="hidden md:inline">Archive</span>
            <span className="sr-only md:hidden">Archive</span>
          </button>
          {session?.status === "archived" && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-status-err/30 px-2 text-xs text-status-err hover:bg-status-err/10 disabled:opacity-50 md:px-2.5"
            >
              <TrashIcon className="size-4" />
              <span className="hidden md:inline">Delete</span>
              <span className="sr-only md:hidden">Delete</span>
            </button>
          )}
          <ViewToggle mode={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
    </header>
  );
}
