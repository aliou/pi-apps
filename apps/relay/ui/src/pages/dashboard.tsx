import { ArrowsClockwiseIcon, TerminalIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SessionCard } from "../components/session-card";
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

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  // Refresh on focus
  useEffect(() => {
    const handleFocus = () => fetchSessions();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <p className="text-(--color-muted-foreground)">
            Active and recent sessions
          </p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
            "border border-(--color-border) bg-(--color-card)",
            "hover:bg-(--color-muted) disabled:opacity-50",
          )}
        >
          <ArrowsClockwiseIcon className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {sessions.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-(--color-border) py-16">
          <TerminalIcon className="mb-4 size-12 text-(--color-muted-foreground)" />
          <h2 className="mb-2 text-lg font-medium">No sessions yet</h2>
          <p className="text-(--color-muted-foreground)">
            Sessions will appear here when clients connect.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
