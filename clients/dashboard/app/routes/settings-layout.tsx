import {
  CodeIcon,
  CubeIcon,
  GearIcon,
  GitBranchIcon,
  GithubLogoIcon,
  KeyIcon,
  PackageIcon,
} from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router";
import { cn } from "../lib/utils";

const SETTINGS_ITEMS = [
  { to: "/settings/secrets", label: "Secrets", icon: KeyIcon },
  { to: "/settings/git", label: "Git", icon: GitBranchIcon },
  { to: "/settings/github", label: "GitHub", icon: GithubLogoIcon },
  { to: "/settings/environments", label: "Environments", icon: CubeIcon },
  { to: "/settings/models", label: "Models", icon: CodeIcon },
  { to: "/settings/extensions", label: "Extensions", icon: PackageIcon },
] as const;

export default function SettingsLayout() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Configure integrations, environments, models, and extensions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-xl border border-border bg-surface/20 p-3">
            <h2 className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-fg">
              <GearIcon className="size-4" weight="bold" />
              Sections
            </h2>

            <nav className="space-y-1">
              {SETTINGS_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-surface text-fg"
                          : "text-muted hover:bg-surface/60 hover:text-fg",
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
