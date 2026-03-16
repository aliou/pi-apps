import { Menu } from "@ark-ui/react/menu";
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
import { Button } from "./ui/button";

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

          <Menu.Root
            composite={false}
            positioning={{ placement: "bottom-end" }}
          >
            <Menu.Trigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 px-2.5"
                aria-label="Session actions"
              >
                <DotsThreeIcon className="size-4" weight="bold" />
                <span className="hidden sm:inline">Actions</span>
              </Button>
            </Menu.Trigger>
            <Menu.Positioner className="z-[120]">
              <Menu.Content className="min-w-52 rounded-lg border border-border bg-bg p-1 shadow-xl">
                <Menu.Item
                  value="toggle-files"
                  onClick={onToggleFiles}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface"
                >
                  <FilesIcon className="size-4" />
                  {filePanelOpen ? "Hide files" : "Show files"}
                </Menu.Item>
                <Menu.Item
                  value="share"
                  onClick={onShare}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface"
                >
                  <ShareNetworkIcon className="size-4" />
                  Share
                </Menu.Item>
                <Menu.Item
                  value="export"
                  disabled={!canMutate}
                  onClick={onExport}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface"
                >
                  <DownloadSimpleIcon className="size-4" />
                  Export
                </Menu.Item>
                <Menu.Item
                  value="restart"
                  disabled={
                    !canMutate ||
                    sandboxStatus?.status === "creating" ||
                    sandboxStatus?.capabilities?.restart === false ||
                    isRestarting
                  }
                  onClick={onRestart}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface"
                >
                  <ArrowClockwiseIcon className="size-4" />
                  Restart
                </Menu.Item>
                <Menu.Item
                  value="archive"
                  disabled={!canMutate || isArchiving}
                  onClick={onArchive}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-fg outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface"
                >
                  <ArchiveBoxIcon className="size-4" />
                  Archive
                </Menu.Item>
                {session?.status === "archived" ? (
                  <Menu.Item
                    value="delete"
                    disabled={isDeleting}
                    onClick={onDelete}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-status-err outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-status-err/10"
                  >
                    <TrashIcon className="size-4" />
                    Delete
                  </Menu.Item>
                ) : null}
              </Menu.Content>
            </Menu.Positioner>
          </Menu.Root>
        </div>
      </div>
    </header>
  );
}
