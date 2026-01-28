import { cn } from "../lib/utils";

type Status = "creating" | "ready" | "running" | "stopped" | "error" | "deleted";

const statusStyles: Record<Status, string> = {
  creating: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  running: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  stopped: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  deleted: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
