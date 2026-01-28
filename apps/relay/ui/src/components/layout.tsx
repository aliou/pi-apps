import {
  GearIcon,
  GithubLogoIcon,
  HouseIcon,
  TerminalIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: HouseIcon },
  { id: "github", label: "GitHub", icon: GithubLogoIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

export function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-(--color-border) bg-(--color-card) p-4">
        <div className="mb-8 flex items-center gap-2">
          <TerminalIcon className="size-6 text-(--color-accent)" weight="bold" />
          <span className="text-lg font-semibold">Pi Relay</span>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                currentPage === item.id
                  ? "bg-(--color-accent) text-(--color-accent-foreground)"
                  : "text-(--color-muted-foreground) hover:bg-(--color-muted) hover:text-(--color-foreground)",
              )}
            >
              <item.icon className="size-5" weight={currentPage === item.id ? "fill" : "regular"} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
