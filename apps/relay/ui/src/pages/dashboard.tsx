import { ArrowsClockwiseIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SessionItem } from "../components/session-item";
import { type Session, api } from "../lib/api";
import { cn } from "../lib/utils";

export function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    const result = await api.get<Session[]>("/sessions");
    if (result.error) {
      setError(result.error);
    } else {
      setSessions(result.data ?? []);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFocus = () => fetchSessions();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-(--color-foreground)">Sessions</h1>
          <p className="text-sm text-(--color-muted)">Active and recent sessions</p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            "text-(--color-muted) hover:bg-(--color-surface) hover:text-(--color-foreground)",
            "disabled:opacity-40",
          )}
        >
          <ArrowsClockwiseIcon className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-(--color-status-err)/20 bg-(--color-status-err)/5 px-4 py-3 text-sm text-(--color-status-err)">
          {error}
        </div>
      )}

      {/* Content */}
      {sessions.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--color-border) py-20">
          <TerminalWindowIcon className="mb-3 size-10 text-(--color-muted)/30" weight="duotone" />
          <p className="mb-1 text-sm font-medium text-(--color-foreground)">No sessions yet</p>
          <p className="text-xs text-(--color-muted)">
            Sessions appear here when clients connect.
          </p>
        </div>
      ) : (
        <div className="-mx-3 flex flex-col">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
