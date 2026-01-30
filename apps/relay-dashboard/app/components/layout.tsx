import {
  GearIcon,
  GithubLogoIcon,
  ListIcon,
  SidebarSimpleIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useSidebar } from "../lib/sidebar";
import { cn } from "../lib/utils";
import { Logo } from "./logo";
import { ThemeToggle, ThemeToggleCycler } from "./theme-toggle";

const navItems = [
  { to: "/", label: "Sessions", icon: SquaresFourIcon },
  { to: "/github", label: "GitHub", icon: GithubLogoIcon },
  { to: "/settings", label: "Settings", icon: GearIcon },
];

export default function AppLayout() {
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const currentLabel =
    navItems.find(
      (item) =>
        item.to === location.pathname ||
        (item.to === "/" && location.pathname === "/"),
    )?.label ?? "Pi Relay";

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
          "flex shrink-0 flex-col bg-(--color-bg-deep) transition-all duration-200 ease-in-out",
          // mobile: fixed drawer
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full shadow-xl",
          "data-[mobile-open]:translate-x-0",
          // desktop: static, collapsible
          "md:static md:z-auto md:translate-x-0 md:shadow-none md:border-r md:border-(--color-border)",
          collapsed ? "md:w-14" : "md:w-64",
        )}
      >
        {/* ── Header: expanded ── */}
        <div
          className={cn(
            "shrink-0 border-b border-(--color-border)",
            collapsed && "md:hidden",
          )}
        >
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <Logo variant="accent" className="size-6 shrink-0" />
              <span className="text-base font-semibold tracking-wide text-(--color-fg)">
                Pi Relay
              </span>
            </div>

            {/* Desktop: collapse toggle */}
            <button
              type="button"
              onClick={toggle}
              className="hidden rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg) md:block"
              title="Collapse sidebar"
            >
              <SidebarSimpleIcon className="size-4" />
            </button>

            {/* Mobile: close */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg) md:hidden"
              aria-label="Close sidebar"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Header: collapsed (desktop only) ── */}
        <div
          className={cn(
            "hidden shrink-0 flex-col items-center gap-3 border-b border-(--color-border) px-2 py-4",
            collapsed && "md:flex",
          )}
        >
          <Logo variant="accent" className="size-6" />
          <button
            type="button"
            onClick={toggle}
            className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg)"
            title="Expand sidebar"
          >
            <SidebarSimpleIcon className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex flex-col gap-1 py-3",
            collapsed ? "md:items-center md:px-2" : "",
            "px-3",
          )}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors",
                  collapsed ? "md:justify-center md:p-2" : "",
                  "gap-3 px-3 py-2",
                  isActive
                    ? "bg-(--color-surface) text-(--color-fg)"
                    : "text-(--color-muted) hover:bg-(--color-surface)/50 hover:text-(--color-fg)",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className="size-[18px] shrink-0"
                    weight={isActive ? "fill" : "regular"}
                  />
                  <span className={cn(collapsed && "md:hidden")}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div
          className={cn(
            "shrink-0 border-t border-(--color-border)",
            collapsed ? "md:flex md:justify-center md:px-2 md:py-4" : "",
            "flex items-center justify-between px-5 py-4",
          )}
        >
          <p
            className={cn(
              "font-mono text-xs text-(--color-muted)/50",
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
        <div className="flex shrink-0 items-center gap-3 border-b border-(--color-border) px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-surface) hover:text-(--color-fg)"
            aria-label="Open sidebar"
          >
            <ListIcon className="size-5" />
          </button>
          <span className="text-sm font-medium text-(--color-fg)">
            {currentLabel}
          </span>
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
