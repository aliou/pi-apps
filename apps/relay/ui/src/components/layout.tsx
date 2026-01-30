import { GearIcon, GithubLogoIcon, SquaresFourIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Logo } from "./logo";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: "dashboard", label: "Sessions", icon: SquaresFourIcon },
  { id: "github", label: "GitHub", icon: GithubLogoIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-(--color-border) bg-(--color-abyssal-deep)">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-5">
          <Logo variant="accent" className="size-5" />
          <span className="text-sm font-semibold tracking-wide text-(--color-foreground)">
            Pi Relay
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 px-2">
          {navItems.map((item) => {
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-(--color-surface) text-(--color-foreground)"
                    : "text-(--color-muted) hover:bg-(--color-surface)/50 hover:text-(--color-foreground)",
                )}
              >
                <item.icon
                  className="size-4"
                  weight={active ? "fill" : "regular"}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="border-t border-(--color-border) px-4 py-3">
          <p className="font-mono text-xs text-(--color-muted)/60">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
