import { ChatCircleIcon, CodeIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import type { Session } from "../lib/api";
import { cn } from "../lib/utils";
import { StatusDot } from "./status-badge";

interface SessionItemProps {
  session: Session;
  className?: string;
}

export function SessionItem({ session, className }: SessionItemProps) {
  const isCode = session.mode === "code";
  const displayName = session.name || session.id.slice(0, 8);
  const lastActivity = new Date(session.lastActivityAt);
  const timeAgo = formatTimeAgo(lastActivity);

  return (
    <Link
      to={`/sessions/${session.id}`}
      className={cn(
        "group flex items-center gap-3.5 rounded-lg px-3.5 py-3 transition-colors",
        "hover:bg-surface",
        className,
      )}
    >
      {/* Icon */}
      <div className="text-muted">
        {isCode ? (
          <CodeIcon className="size-[18px]" weight="bold" />
        ) : (
          <ChatCircleIcon className="size-[18px]" weight="bold" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">
            {displayName}
          </span>
          <StatusDot status={session.status} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {session.repoId && (
            <>
              <span className="truncate font-mono">{session.repoId}</span>
              <span className="text-muted/30">~</span>
            </>
          )}
          <span className="shrink-0">{timeAgo}</span>
        </div>
      </div>

      {/* Model badge */}
      {session.currentModelId && (
        <span className="shrink-0 rounded-md bg-surface px-2 py-1 font-mono text-xs text-muted group-hover:bg-surface-hover">
          {session.currentModelId}
        </span>
      )}
    </Link>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}
