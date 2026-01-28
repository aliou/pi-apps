import { ChatCircleIcon, CodeIcon } from "@phosphor-icons/react";
import type { Session } from "../lib/api";
import { cn } from "../lib/utils";
import { StatusBadge } from "./status-badge";

interface SessionCardProps {
  session: Session;
  className?: string;
}

export function SessionCard({ session, className }: SessionCardProps) {
  const isCode = session.mode === "code";
  const displayName = session.name || session.id.slice(0, 8);
  const lastActivity = new Date(session.lastActivityAt);
  const timeAgo = formatTimeAgo(lastActivity);

  return (
    <div
      className={cn(
        "rounded-lg border border-(--color-border) bg-(--color-card) p-4 transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              isCode
                ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
            )}
          >
            {isCode ? (
              <CodeIcon className="size-5" weight="bold" />
            ) : (
              <ChatCircleIcon className="size-5" weight="bold" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-(--color-card-foreground)">{displayName}</h3>
            <p className="text-sm text-(--color-muted-foreground)">
              {isCode ? session.repoId || "No repo" : "Chat session"}
            </p>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {session.branchName && (
        <p className="mt-3 text-sm text-(--color-muted-foreground)">
          Branch: <code className="rounded bg-(--color-muted) px-1">{session.branchName}</code>
        </p>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-(--color-muted-foreground)">
        <span>Last active: {timeAgo}</span>
        {session.currentModelProvider && session.currentModelId && (
          <span>
            {session.currentModelProvider}/{session.currentModelId}
          </span>
        )}
      </div>
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
