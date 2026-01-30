import { ChatCircleIcon, CodeIcon } from "@phosphor-icons/react";
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
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
        "hover:bg-(--color-surface)",
        className,
      )}
    >
      {/* Icon */}
      <div className="text-(--color-muted)">
        {isCode ? (
          <CodeIcon className="size-4" weight="bold" />
        ) : (
          <ChatCircleIcon className="size-4" weight="bold" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-(--color-foreground)">
            {displayName}
          </span>
          <StatusDot status={session.status} />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-(--color-muted)">
          {session.repoId && (
            <>
              <span className="truncate font-mono">{session.repoId}</span>
              <span className="text-(--color-muted)/40">~</span>
            </>
          )}
          <span className="shrink-0">{timeAgo}</span>
        </div>
      </div>

      {/* Model badge */}
      {session.currentModelId && (
        <span className="shrink-0 rounded bg-(--color-surface) px-1.5 py-0.5 font-mono text-xs text-(--color-muted) group-hover:bg-(--color-surface-hover)">
          {session.currentModelId}
        </span>
      )}
    </div>
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
