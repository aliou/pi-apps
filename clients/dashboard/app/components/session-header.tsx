import {
  ArchiveBoxIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  BugIcon,
  ChatCircleIcon,
  TerminalWindowIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link } from "react-router";
import { Button } from "./ui/button";
import type { SandboxStatusResponse, Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";

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
      <button
        type="button"
        onClick={() => onChange("terminal")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
          mode === "terminal"
            ? "bg-accent text-accent-fg"
            : "text-muted hover:text-fg",
        )}
      >
        <TerminalWindowIcon className="w-4 h-4" />
        Terminal
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
  isArchiving,
  isDeleting,
  isRestarting,
}: SessionHeaderProps) {
  return (
    <header className="flex-shrink-0 px-6 py-3 border-b border-border bg-surface md:px-10">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/sessions"
            className="text-muted hover:text-fg transition-colors p-1 -ml-1"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-fg">
                {session?.name || sessionId?.slice(0, 8)}
              </h1>
              <SessionStatusBadge
                session={session}
                connectionStatus={connectionStatus}
                sandboxStatus={sandboxStatus}
              />
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
          <Button
            variant="secondary"
            size="sm"
            onClick={onRestart}
            disabled={
              !session ||
              session.status === "archived" ||
              sandboxStatus?.status === "creating" ||
              isRestarting
            }
            loading={isRestarting}
          >
            <ArrowClockwiseIcon className="size-4" />
            Restart
          </Button>
          <button
            type="button"
            onClick={onArchive}
            disabled={!session || session.status === "archived" || isArchiving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
          >
            <ArchiveBoxIcon className="size-4" />
            Archive
          </button>
          {session?.status === "archived" && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-status-err/30 px-2.5 py-1.5 text-xs text-status-err hover:bg-status-err/10 disabled:opacity-50"
            >
              <TrashIcon className="size-4" />
              Delete
            </button>
          )}
          <ViewToggle mode={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
    </header>
  );
}
