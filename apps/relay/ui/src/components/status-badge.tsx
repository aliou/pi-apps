import { cn } from "../lib/utils";

type Status = "creating" | "ready" | "running" | "stopped" | "error" | "deleted";

const dotColors: Record<Status, string> = {
  creating: "bg-(--color-status-info)",
  ready: "bg-(--color-status-ok)",
  running: "bg-(--color-accent)",
  stopped: "bg-(--color-muted)/40",
  error: "bg-(--color-status-err)",
  deleted: "bg-(--color-muted)/20",
};

const badgeStyles: Record<Status, string> = {
  creating: "bg-(--color-status-info)/10 text-(--color-status-info)",
  ready: "bg-(--color-status-ok)/10 text-(--color-status-ok)",
  running: "bg-(--color-accent)/10 text-(--color-accent)",
  stopped: "bg-(--color-muted)/10 text-(--color-muted)",
  error: "bg-(--color-status-err)/10 text-(--color-status-err)",
  deleted: "bg-(--color-muted)/10 text-(--color-muted)/60",
};

interface StatusDotProps {
  status: Status;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        dotColors[status],
        status === "running" && "animate-pulse",
        className,
      )}
    />
  );
}

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        badgeStyles[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {status}
    </span>
  );
}
