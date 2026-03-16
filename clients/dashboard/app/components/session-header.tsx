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
import { Link } from "react-router";
import type { SandboxStatusResponse, Session } from "../lib/api";
import type { ConnectionStatus } from "../lib/use-session-events";
import { cn } from "../lib/utils";
import { ActionSplitButton } from "./ui";

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

  return (
    <header className="flex-shrink-0 border-b border-border bg-surface px-4 py-3 md:px-10">
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

          <ActionSplitButton.Root>
            <ActionSplitButton.Main
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 px-2.5"
              onClick={onToggleFiles}
              title={filePanelOpen ? "Hide files" : "Show files"}
            >
              <DotsThreeIcon className="size-4" weight="bold" />
              <span className="hidden sm:inline">Actions</span>
            </ActionSplitButton.Main>
            <ActionSplitButton.Menu variant="secondary" size="sm">
              <ActionSplitButton.Item
                value="toggle-files"
                onSelect={onToggleFiles}
              >
                <span className="inline-flex items-center gap-2">
                  <FilesIcon className="size-4" />
                  {filePanelOpen ? "Hide files" : "Show files"}
                </span>
              </ActionSplitButton.Item>
              <ActionSplitButton.Item value="share" onSelect={onShare}>
                <span className="inline-flex items-center gap-2">
                  <ShareNetworkIcon className="size-4" />
                  Share
                </span>
              </ActionSplitButton.Item>
              <ActionSplitButton.Item
                value="export"
                onSelect={() => {
                  if (!canMutate) return;
                  onExport();
                }}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-2",
                    !canMutate && "opacity-50",
                  )}
                >
                  <DownloadSimpleIcon className="size-4" />
                  Export
                </span>
              </ActionSplitButton.Item>
              <ActionSplitButton.Item
                value="restart"
                onSelect={() => {
                  if (
                    !canMutate ||
                    sandboxStatus?.status === "creating" ||
                    sandboxStatus?.capabilities?.restart === false ||
                    isRestarting
                  ) {
                    return;
                  }
                  onRestart();
                }}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-2",
                    (!canMutate ||
                      sandboxStatus?.status === "creating" ||
                      sandboxStatus?.capabilities?.restart === false ||
                      isRestarting) && "opacity-50",
                  )}
                >
                  <ArrowClockwiseIcon className="size-4" />
                  Restart
                </span>
              </ActionSplitButton.Item>
              <ActionSplitButton.Item
                value="archive"
                onSelect={() => {
                  if (!canMutate || isArchiving) return;
                  onArchive();
                }}
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-2",
                    (!canMutate || isArchiving) && "opacity-50",
                  )}
                >
                  <ArchiveBoxIcon className="size-4" />
                  Archive
                </span>
              </ActionSplitButton.Item>
              {session?.status === "archived" ? (
                <ActionSplitButton.Item
                  value="delete"
                  onSelect={() => {
                    if (isDeleting) return;
                    onDelete();
                  }}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 text-status-err",
                      isDeleting && "opacity-50",
                    )}
                  >
                    <TrashIcon className="size-4" />
                    Delete
                  </span>
                </ActionSplitButton.Item>
              ) : null}
            </ActionSplitButton.Menu>
          </ActionSplitButton.Root>
        </div>
      </div>
    </header>
  );
}
