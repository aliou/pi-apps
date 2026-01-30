import { cn } from "../lib/utils";

type Status =
  | "creating"
  | "ready"
  | "running"
  | "stopped"
  | "error"
  | "deleted";

const dotColors: Record<Status, string> = {
  creating: "bg-status-info",
  ready: "bg-status-ok",
  running: "bg-accent",
  stopped: "bg-muted/40",
  error: "bg-status-err",
  deleted: "bg-muted/20",
};

const badgeStyles: Record<Status, string> = {
  creating: "bg-status-info/10 text-status-info",
  ready: "bg-status-ok/10 text-status-ok",
  running: "bg-accent/10 text-accent",
  stopped: "bg-muted/10 text-muted",
  error: "bg-status-err/10 text-status-err",
  deleted: "bg-muted/10 text-muted/60",
};

interface StatusDotProps {
  status: Status;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        badgeStyles[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {status}
    </span>
  );
}
