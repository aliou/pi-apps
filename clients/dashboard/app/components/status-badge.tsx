import { cn } from "../lib/utils";

type Status = "creating" | "active" | "idle" | "archived" | "error";

const dotColors: Record<Status, string> = {
  creating: "bg-status-info",
  active: "bg-accent",
  idle: "bg-muted/40",
  archived: "bg-muted/20",
  error: "bg-status-err",
};

const badgeStyles: Record<Status, string> = {
  creating: "bg-status-info/10 text-status-info",
  active: "bg-accent/10 text-accent",
  idle: "bg-muted/10 text-muted",
  archived: "bg-muted/10 text-muted/60",
  error: "bg-status-err/10 text-status-err",
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
        status === "active" && "animate-pulse",
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
