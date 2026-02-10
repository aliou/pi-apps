import {
  GearIcon,
  ListIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api, type Session } from "../lib/api";
import { useSidebar } from "../lib/sidebar";
import { cn, getSessionDisplayTitle } from "../lib/utils";
import { Logo } from "./logo";
import { StatusDot } from "./status-badge";
import { ThemeToggle, ThemeToggleCycler } from "./theme-toggle";

export default function AppLayout() {
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const location = useLocation();

  // Fetch sessions
  const fetchSessions = async () => {
    const res = await api.get<Session[]>("/sessions");
    if (res.data) {
      setSessions(res.data);
    }
    setSessionsLoading(false);
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Determine current page label for mobile header
  const currentLabel = (() => {
    if (location.pathname === "/") return "Sessions";
    if (location.pathname.startsWith("/sessions/")) return "Session";
    if (location.pathname.startsWith("/settings")) {
      if (location.pathname === "/settings/secrets") return "Settings: Secrets";
      if (location.pathname === "/settings/github") return "Settings: GitHub";
      if (location.pathname === "/settings/environments")
        return "Settings: Environments";
      return "Settings";
    }
    return "Pi Relay";
  })();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Mobile backdrop ── */}
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

      {/* ── Sidebar ── */}
      <aside
        data-mobile-open={mobileOpen || undefined}
        className={cn(
          "flex shrink-0 flex-col bg-bg-deep transition-all duration-200 ease-in-out",
          // mobile: fixed drawer
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full shadow-xl",
          "data-[mobile-open]:translate-x-0",
          // desktop: static, collapsible
          "md:static md:z-auto md:translate-x-0 md:shadow-none md:border-r md:border-border",
          collapsed ? "md:w-14" : "md:w-64",
        )}
      >
        {/* ── Header: expanded ── */}
        <div
          className={cn(
            "shrink-0 border-b border-border",
            collapsed && "md:hidden",
          )}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <NavLink
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3"
            >
              <Logo variant="accent" className="size-6 shrink-0" />
              <span className="text-base font-semibold tracking-wide text-fg">
                Pi Relay
              </span>
            </NavLink>

            {/* Desktop: collapse toggle */}
            <button
              type="button"
              onClick={toggle}
              className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg md:block"
              title="Collapse sidebar"
            >
              <SidebarSimpleIcon className="size-4" />
            </button>

            {/* Mobile: close */}
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

        {/* ── Header: collapsed (desktop only) ── */}
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

        {/* ── Sessions List Section ── */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            collapsed ? "md:px-2 md:py-3" : "px-3 py-3",
          )}
        >
          {/* Sessions label (only in expanded mode) */}
          <div className={cn("mb-2 px-3", collapsed && "md:hidden")}>
            <span className="text-xs font-medium uppercase tracking-wider text-muted/70">
              Sessions
            </span>
          </div>

          {/* Sessions list (scrollable) */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {sessionsLoading ? (
              <div
                className={cn(
                  "px-3 py-2 text-xs text-muted",
                  collapsed && "md:px-0 md:text-center",
                )}
              >
                {collapsed ? (
                  <span className="md:hidden">Loading...</span>
                ) : (
                  "Loading..."
                )}
              </div>
            ) : sessions.length === 0 ? (
              <div
                className={cn(
                  "px-3 py-2 text-xs text-muted",
                  collapsed && "md:px-0 md:text-center",
                )}
              >
                {collapsed ? (
                  <span className="md:hidden">No sessions</span>
                ) : (
                  "No sessions"
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {sessions.map((session) => {
                  const isActive =
                    location.pathname === `/sessions/${session.id}`;
                  const displayName = getSessionDisplayTitle(session);

                  return (
                    <NavLink
                      key={session.id}
                      to={`/sessions/${session.id}`}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? displayName : undefined}
                      className={cn(
                        "flex items-center rounded-lg text-sm transition-colors",
                        collapsed
                          ? "md:justify-center md:p-2"
                          : "gap-2.5 px-3 py-2",
                        isActive
                          ? "bg-surface text-fg"
                          : "text-muted hover:bg-surface/50 hover:text-fg",
                      )}
                    >
                      <StatusDot status={session.status} className="shrink-0" />
                      <span
                        className={cn("truncate", collapsed && "md:hidden")}
                      >
                        {displayName}
                      </span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="shrink-0" />

        {/* ── Settings Link ── */}
        <div
          className={cn(
            "shrink-0 border-t border-border py-3",
            collapsed ? "md:px-2" : "px-3",
          )}
        >
          <NavLink
            to="/settings/secrets"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? "Settings" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium transition-colors",
              collapsed ? "md:justify-center md:p-2" : "gap-3 px-3 py-2",
              location.pathname.startsWith("/settings")
                ? "bg-surface text-fg"
                : "text-muted hover:bg-surface/50 hover:text-fg",
            )}
          >
            <GearIcon
              className="size-[18px] shrink-0"
              weight={
                location.pathname.startsWith("/settings") ? "fill" : "regular"
              }
            />
            <span className={cn(collapsed && "md:hidden")}>Settings</span>
          </NavLink>
        </div>

        {/* ── Footer ── */}
        <div
          className={cn(
            "shrink-0 border-t border-border",
            collapsed ? "md:flex md:justify-center md:px-2 md:py-4" : "",
            "flex items-center justify-between px-5 py-4",
          )}
        >
          <p
            className={cn(
              "font-mono text-xs text-muted/50",
              collapsed && "md:hidden",
            )}
          >
            v0.1.0
          </p>
          <span className={cn(collapsed && "md:hidden")}>
            <ThemeToggle />
          </span>
          <span className={cn("hidden", collapsed && "md:block")}>
            <ThemeToggleCycler />
          </span>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
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
