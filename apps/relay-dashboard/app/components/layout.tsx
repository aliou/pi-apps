import {
  GearIcon,
  GithubLogoIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router";
import { cn } from "../lib/utils";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { to: "/", label: "Sessions", icon: SquaresFourIcon },
  { to: "/github", label: "GitHub", icon: GithubLogoIcon },
  { to: "/settings", label: "Settings", icon: GearIcon },
];

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-(--color-border) bg-(--color-bg-deep)">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-6">
          <Logo variant="accent" className="size-6" />
          <span className="text-base font-semibold tracking-wide text-(--color-fg)">
            Pi Relay
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-(--color-surface) text-(--color-fg)"
                    : "text-(--color-muted) hover:bg-(--color-surface)/50 hover:text-(--color-fg)",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className="size-[18px]"
                    weight={isActive ? "fill" : "regular"}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-(--color-border) px-5 py-4">
          <p className="font-mono text-xs text-(--color-muted)/50">v0.1.0</p>
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-10 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
