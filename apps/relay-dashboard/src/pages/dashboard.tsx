import { ArrowsClockwiseIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { SessionItem } from "../components/session-item";
import { api, type Session } from "../lib/api";
import { cn } from "../lib/utils";

export function DashboardPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const result = await api.get<Session[]>("/sessions");
    if (result.error) {
      setError(result.error);
    } else {
      setSessions(result.data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  useEffect(() => {
    const handleFocus = () => fetchSessions();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchSessions]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-(--color-fg)">Sessions</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            Active and recent sessions
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSessions}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "text-(--color-muted) hover:bg-(--color-surface) hover:text-(--color-fg)",
            "disabled:opacity-40",
          )}
        >
          <ArrowsClockwiseIcon
            className={cn("size-4", loading && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-(--color-status-err)/20 bg-(--color-status-err)/5 px-4 py-3 text-sm text-(--color-status-err)">
          {error}
        </div>
      )}

      {/* Content */}
      {sessions.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-(--color-border) py-24">
          <TerminalWindowIcon
            className="mb-4 size-12 text-(--color-muted)/25"
            weight="duotone"
          />
          <p className="mb-1 text-base font-medium text-(--color-fg)">
            No sessions yet
          </p>
          <p className="text-sm text-(--color-muted)">
            Sessions appear here when clients connect.
          </p>
        </div>
      ) : (
        <div className="-mx-3.5 flex flex-col">
          {sessions.map((session) => (
            <SessionItem key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
