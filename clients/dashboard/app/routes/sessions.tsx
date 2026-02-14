import { ChatCircleIcon, CodeIcon, GitBranchIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, type Session } from "../lib/api";
import { StatusDot } from "../components/status-badge";
import { getSessionDisplayTitle } from "../lib/utils";

function getRepoLabel(session: Session): string | null {
  if (session.repoFullName) return session.repoFullName;
  if (!session.repoPath) return null;
  const parts = session.repoPath.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return "-";

  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return "now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

function SessionRow({ session }: { session: Session }) {
  const title = getSessionDisplayTitle(session);
  const repo = getRepoLabel(session);

  return (
    <Link
      to={`/sessions/${session.id}`}
      className="block rounded-lg border border-border bg-surface/30 px-4 py-3 transition-colors hover:bg-surface"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={session.status} className="shrink-0" />
          {session.mode === "chat" ? (
            <ChatCircleIcon className="size-4 shrink-0 text-muted" />
          ) : (
            <CodeIcon className="size-4 shrink-0 text-muted" />
          )}
          <span className="truncate text-sm font-medium text-fg">{title}</span>
        </div>
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {formatRelativeTime(session.lastActivityAt)}
        </span>
      </div>

      {session.mode === "code" && repo ? (
        <div className="mt-1.5 flex items-center gap-1.5 pl-6 text-xs text-muted">
          <GitBranchIcon className="size-3.5 shrink-0" />
          <span className="truncate">{repo}</span>
        </div>
      ) : null}
    </Link>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    const res = await api.get<Session[]>("/sessions");
    if (res.data) setSessions(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const grouped = useMemo(() => {
    const sorted = [...sessions].sort((a, b) =>
      b.lastActivityAt.localeCompare(a.lastActivityAt),
    );

    return {
      active: sorted.filter((s) => s.status === "active" || s.status === "creating"),
      idle: sorted.filter((s) => s.status === "idle" || s.status === "error"),
      archived: sorted.filter((s) => s.status === "archived"),
    };
  }, [sessions]);

  const sections = [
    { title: "Active", items: grouped.active },
    { title: "Idle", items: grouped.idle },
    { title: "Archived", items: grouped.archived },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-fg">Sessions</h1>
        <p className="mt-1 text-sm text-muted">Recent sessions across chat and code.</p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
          No sessions yet.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) =>
            section.items.length > 0 ? (
              <section key={section.title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">
                  {section.title}
                </h2>
                <div className="space-y-2">
                  {section.items.map((session) => (
                    <SessionRow key={session.id} session={session} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
