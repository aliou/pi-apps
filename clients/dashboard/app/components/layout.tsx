import {
  CaretDownIcon,
  CaretRightIcon,
  ChatCircleIcon,
  CodeIcon,
  CubeIcon,
  GearIcon,
  GitBranchIcon,
  GithubLogoIcon,
  KeyIcon,
  ListIcon,
  PackageIcon,
  SidebarSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, type Session } from "../lib/api";
import { useSidebar } from "../lib/sidebar";
import { cn, getSessionDisplayTitle } from "../lib/utils";
import { Logo } from "./logo";
import { StatusDot } from "./status-badge";
import { ThemeToggle, ThemeToggleCycler } from "./theme-toggle";
import { Collapsible } from "./ui";

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

function getRepoLabel(session: Session): string | undefined {
  // Match native app: prefer fullName (user/name). Fallback to repoPath basename.
  if (session.repoFullName) return session.repoFullName;
  if (!session.repoPath) return undefined;

  const parts = session.repoPath.split("/").filter(Boolean);
  return parts.at(-1);
}

export default function AppLayout() {
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  useEffect(() => {
    if (location.pathname.startsWith("/settings")) setSettingsOpen(true);
  }, [location.pathname]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    const res = await api.get<Session[]>("/sessions");
    if (res.data) {
      setSessions(res.data);
    }
    setSessionsLoading(false);
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Determine current page label for mobile header
  const currentLabel = (() => {
    if (location.pathname === "/") return "New Session";
    if (location.pathname.startsWith("/sessions/")) return "Session";
    if (location.pathname.startsWith("/settings")) {
      if (location.pathname === "/settings/secrets") return "Settings: Secrets";
      if (location.pathname === "/settings/github") return "Settings: GitHub";
      if (location.pathname === "/settings/environments")
        return "Settings: Environments";
      if (location.pathname === "/settings/models") return "Settings: Models";
      if (location.pathname === "/settings/extensions")
        return "Settings: Extensions";
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

        {/* ── Settings (accordion) ── */}
        <div
          className={cn(
            "shrink-0 border-b border-border",
            collapsed ? "md:px-2 md:py-3" : "px-3 py-3",
          )}
        >
          {collapsed ? (
            <NavLink
              to="/settings/secrets"
              onClick={() => setMobileOpen(false)}
              title="Settings"
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                "md:justify-center md:p-2",
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
              <span className="md:hidden">Settings</span>
            </NavLink>
          ) : (
            <Collapsible.Root
              open={settingsOpen}
              onOpenChange={(details) => {
                setSettingsOpen(details.open);
              }}
            >
              <Collapsible.Trigger
                type="button"
                onClick={() => {
                  // On open / first click, always navigate to the first settings page.
                  if (!settingsOpen) navigate("/settings/secrets");
                }}
                className={cn(
                  "w-full flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  location.pathname.startsWith("/settings")
                    ? "bg-surface text-fg"
                    : "text-muted hover:bg-surface/50 hover:text-fg",
                )}
              >
                <GearIcon
                  className="size-[18px] shrink-0"
                  weight={
                    location.pathname.startsWith("/settings")
                      ? "fill"
                      : "regular"
                  }
                />
                <span className="ml-3">Settings</span>
                <span className="ml-auto text-muted">
                  {settingsOpen ? (
                    <CaretDownIcon className="size-4" />
                  ) : (
                    <CaretRightIcon className="size-4" />
                  )}
                </span>
              </Collapsible.Trigger>

              <Collapsible.Content>
                <div className="mt-1 flex flex-col gap-1 pl-3">
                  <NavLink
                    to="/settings/secrets"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      location.pathname === "/settings/secrets"
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-surface/50 hover:text-fg",
                    )}
                  >
                    <KeyIcon className="size-[18px]" weight="regular" />
                    Secrets
                  </NavLink>
                  <NavLink
                    to="/settings/github"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      location.pathname === "/settings/github"
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-surface/50 hover:text-fg",
                    )}
                  >
                    <GithubLogoIcon className="size-[18px]" weight="regular" />
                    GitHub
                  </NavLink>
                  <NavLink
                    to="/settings/environments"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      location.pathname === "/settings/environments"
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-surface/50 hover:text-fg",
                    )}
                  >
                    <CubeIcon className="size-[18px]" weight="regular" />
                    Environments
                  </NavLink>
                  <NavLink
                    to="/settings/models"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      location.pathname === "/settings/models"
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-surface/50 hover:text-fg",
                    )}
                  >
                    <CodeIcon className="size-[18px]" weight="regular" />
                    Models
                  </NavLink>
                  <NavLink
                    to="/settings/extensions"
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                      location.pathname === "/settings/extensions"
                        ? "bg-surface text-fg"
                        : "text-muted hover:bg-surface/50 hover:text-fg",
                    )}
                  >
                    <PackageIcon className="size-[18px]" weight="regular" />
                    Extensions
                  </NavLink>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          )}
        </div>

        {/* ── Sessions List Section ── */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            collapsed ? "md:px-2 md:py-3" : "px-3 py-3",
          )}
        >
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
              (() => {
                const sorted = [...sessions].sort((a, b) =>
                  b.lastActivityAt.localeCompare(a.lastActivityAt),
                );

                const activeSessions = sorted.filter(
                  (s) => s.status === "active" || s.status === "creating",
                );
                const idleSessions = sorted.filter(
                  (s) => s.status === "idle" || s.status === "error",
                );
                const archivedSessions = sorted.filter(
                  (s) => s.status === "archived",
                );

                const renderRow = (session: Session) => {
                  const isCurrent =
                    location.pathname === `/sessions/${session.id}`;
                  const displayName = getSessionDisplayTitle(session);
                  const repoLabel = getRepoLabel(session);

                  return (
                    <NavLink
                      key={session.id}
                      to={`/sessions/${session.id}`}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? displayName : undefined}
                      className={cn(
                        "w-full rounded-lg text-sm transition-colors",
                        collapsed
                          ? "flex items-center md:justify-center md:p-2"
                          : "flex items-center px-3 py-2",
                        isCurrent
                          ? "bg-surface text-fg"
                          : "text-muted hover:bg-surface/50 hover:text-fg",
                      )}
                    >
                      <div
                        className={cn(
                          "min-w-0 flex flex-1 flex-col",
                          collapsed && "md:hidden",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <StatusDot
                              status={session.status}
                              className="shrink-0"
                            />
                            {session.mode === "chat" ? (
                              <ChatCircleIcon className="size-3.5 shrink-0" />
                            ) : (
                              <CodeIcon className="size-3.5 shrink-0" />
                            )}
                            <span className="truncate">{displayName}</span>
                          </div>

                          <span className="shrink-0 text-xs text-muted tabular-nums">
                            {formatRelativeTime(session.lastActivityAt)}
                          </span>
                        </div>

                        {session.mode !== "chat" && repoLabel && (
                          <div className="mt-0.5 flex min-w-0 items-center gap-1 pl-3.5 text-xs text-muted">
                            <GitBranchIcon className="size-3.5 shrink-0" />
                            <span className="truncate">{repoLabel}</span>
                          </div>
                        )}
                      </div>
                    </NavLink>
                  );
                };

                const Section = ({
                  title,
                  items,
                }: {
                  title: string;
                  items: Session[];
                }) => {
                  if (items.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-1">
                      <div
                        className={cn("px-3 pt-2", collapsed && "md:hidden")}
                      >
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted/70">
                          {title}
                        </span>
                      </div>
                      {items.map(renderRow)}
                    </div>
                  );
                };

                return (
                  <div className="flex flex-col gap-2">
                    <Section title="Active" items={activeSessions} />
                    <Section title="Idle" items={idleSessions} />

                    {archivedSessions.length > 0 && !collapsed ? (
                      <Collapsible.Root
                        open={archivedOpen}
                        onOpenChange={(details) =>
                          setArchivedOpen(details.open)
                        }
                      >
                        <div className="px-3 pt-2">
                          <Collapsible.Trigger
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium",
                              "text-muted hover:bg-surface/50 hover:text-fg",
                            )}
                          >
                            Archived
                            <span className="ml-auto text-muted">
                              {archivedOpen ? (
                                <CaretDownIcon className="size-4" />
                              ) : (
                                <CaretRightIcon className="size-4" />
                              )}
                            </span>
                          </Collapsible.Trigger>
                        </div>
                        <Collapsible.Content>
                          <div className="mt-1 flex flex-col gap-1">
                            {archivedSessions.map(renderRow)}
                          </div>
                        </Collapsible.Content>
                      </Collapsible.Root>
                    ) : null}
                  </div>
                );
              })()
            )}
          </div>
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
