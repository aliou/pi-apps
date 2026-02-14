import {
  ChatCircleIcon,
  CodeIcon,
  GearIcon,
  GitBranchIcon,
  ListIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, type Session } from "../lib/api";
import { useSidebar } from "../lib/sidebar";
import { cn, getSessionDisplayTitle } from "../lib/utils";
import { Logo } from "./logo";
import { StatusDot } from "./status-badge";
import { ThemeToggle, ThemeToggleCycler } from "./theme-toggle";
import { ActionSplitButton } from "./ui";

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

function getRepoLabel(session: Session): string | null {
  if (session.repoFullName) return session.repoFullName;
  if (!session.repoPath) return null;
  const parts = session.repoPath.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function SidebarLink({
  to,
  icon,
  label,
  active,
  onClick,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "md:justify-center md:p-2" : "gap-2 px-3 py-2",
        active
          ? "bg-surface text-fg"
          : "text-muted hover:bg-surface/50 hover:text-fg",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn(collapsed && "md:hidden")}>{label}</span>
    </NavLink>
  );
}

export default function AppLayout() {
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const loadSessions = useCallback(async () => {
    const res = await api.get<Session[]>("/sessions");
    if (res.data) setSessions(res.data);
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 30000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    [sessions],
  );

  const currentLabel = (() => {
    if (location.pathname === "/") return "New Session";
    if (location.pathname === "/sessions") return "Sessions";
    if (location.pathname.startsWith("/sessions/")) return "Session";
    if (location.pathname.startsWith("/settings")) return "Settings";
    return "Pi Relay";
  })();

  return (
    <div className="flex h-screen overflow-hidden">
      <button
        type="button"
        aria-label="Close sidebar"
        tabIndex={-1}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity md:hidden",
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        data-mobile-open={mobileOpen || undefined}
        className={cn(
          "flex shrink-0 flex-col overflow-visible bg-bg-deep transition-all duration-200 ease-in-out",
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full shadow-xl",
          "data-[mobile-open]:translate-x-0",
          "md:static md:z-auto md:translate-x-0 md:shadow-none md:border-r md:border-border",
          collapsed ? "md:w-14" : "md:w-64",
        )}
      >
        <div className={cn("shrink-0 border-b border-border", collapsed && "md:hidden")}>
          <div className="flex items-center justify-between px-5 py-4">
            <NavLink
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3"
            >
              <Logo variant="accent" className="size-6 shrink-0" />
              <span className="text-base font-semibold tracking-wide text-fg">Pi Relay</span>
            </NavLink>

            <button
              type="button"
              onClick={toggle}
              className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg md:block"
              title="Collapse sidebar"
            >
              <SidebarSimpleIcon className="size-4" />
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg md:hidden"
              aria-label="Close sidebar"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "hidden shrink-0 flex-col items-center gap-3 border-b border-border px-2 py-4",
            collapsed && "md:flex",
          )}
        >
          <NavLink to="/" onClick={() => setMobileOpen(false)}>
            <Logo variant="accent" className="size-6" />
          </NavLink>
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
            title="Expand sidebar"
          >
            <SidebarSimpleIcon className="size-4" />
          </button>
        </div>

        <div className={cn("flex min-h-0 flex-1 flex-col", collapsed ? "md:px-2 md:py-3" : "px-3 py-3")}>
          <div className="space-y-2">
            {collapsed ? (
              <button
                type="button"
                onClick={() => {
                  navigate("/?mode=chat");
                  setMobileOpen(false);
                }}
                title="New chat"
                className="flex w-full items-center justify-center rounded-lg bg-accent p-2 text-accent-fg transition-colors hover:bg-accent-hover"
              >
                <ChatCircleIcon className="size-[18px]" />
              </button>
            ) : (
              <ActionSplitButton.Root className="w-full">
                <ActionSplitButton.Main
                  type="button"
                  onClick={() => {
                    navigate("/?mode=chat");
                    setMobileOpen(false);
                  }}
                  className="w-full justify-start"
                >
                  <ChatCircleIcon className="size-4" />
                  New chat
                </ActionSplitButton.Main>
                <ActionSplitButton.Menu>
                  <ActionSplitButton.Item
                    value="new-code-session"
                    onSelect={() => {
                      navigate("/?mode=code");
                      setMobileOpen(false);
                    }}
                    description="Creates a code session setup from the home form."
                  >
                    <span className="inline-flex items-center gap-2">
                      <CodeIcon className="size-4" />
                      New session (code)
                    </span>
                  </ActionSplitButton.Item>
                </ActionSplitButton.Menu>
              </ActionSplitButton.Root>
            )}

            <SidebarLink
              to="/sessions"
              icon={<ListIcon className="size-[18px]" />}
              label="Sessions"
              active={
                location.pathname === "/sessions" || location.pathname.startsWith("/sessions/")
              }
              onClick={() => setMobileOpen(false)}
              collapsed={collapsed}
            />

            <SidebarLink
              to="/settings"
              icon={<GearIcon className="size-[18px]" />}
              label="Settings"
              active={location.pathname.startsWith("/settings")}
              onClick={() => setMobileOpen(false)}
              collapsed={collapsed}
            />
          </div>

          {!collapsed && (
            <>
              <div className="my-3 h-px bg-border" />
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
                Sessions
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {orderedSessions.map((session) => {
                  const title = getSessionDisplayTitle(session);
                  const repo = getRepoLabel(session);

                  return (
                    <NavLink
                      key={session.id}
                      to={`/sessions/${session.id}`}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-lg px-3 py-2 transition-colors",
                          isActive
                            ? "bg-surface text-fg"
                            : "text-muted hover:bg-surface/60 hover:text-fg",
                        )
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <StatusDot status={session.status} className="shrink-0" />
                          {session.mode === "chat" ? (
                            <ChatCircleIcon className="size-3.5 shrink-0" />
                          ) : (
                            <CodeIcon className="size-3.5 shrink-0" />
                          )}
                          <span className="truncate text-xs">{title}</span>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted/70">
                          {formatRelativeTime(session.lastActivityAt)}
                        </span>
                      </div>
                      {session.mode === "code" && repo ? (
                        <div className="mt-1 flex min-w-0 items-center gap-1 pl-3 text-[11px] text-muted/70">
                          <GitBranchIcon className="size-3 shrink-0" />
                          <span className="truncate">{repo}</span>
                        </div>
                      ) : null}
                    </NavLink>
                  );
                })}

                {orderedSessions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">No sessions</p>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div
          className={cn(
            "shrink-0 border-t border-border",
            collapsed ? "md:flex md:justify-center md:px-2 md:py-4" : "",
            "flex items-center justify-between px-5 py-4",
          )}
        >
          <p className={cn("font-mono text-xs text-muted/50", collapsed && "md:hidden")}>v0.1.0</p>
          <span className={cn(collapsed && "md:hidden")}>
            <ThemeToggle />
          </span>
          <span className={cn("hidden", collapsed && "md:block")}>
            <ThemeToggleCycler />
          </span>
        </div>
      </aside>

      <main className="relative z-0 flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
            aria-label="Open sidebar"
          >
            <ListIcon className="size-5" />
          </button>
          <span className="text-sm font-medium text-fg">{currentLabel}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-8 md:px-10 md:py-10">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
