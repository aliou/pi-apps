import { CubeIcon, GearIcon, GithubLogoIcon, KeyIcon } from "@phosphor-icons/react";
import { NavLink, Outlet } from "react-router";
import { cn } from "../lib/utils";

const tabs = [
  { to: "/settings/secrets", label: "Secrets", icon: KeyIcon },
  { to: "/settings/github", label: "GitHub", icon: GithubLogoIcon },
  { to: "/settings/environments", label: "Environments", icon: CubeIcon },
];

export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <GearIcon className="size-6" weight="bold" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Configure API keys, integrations, and environments.
        </p>
      </div>

      {/* Horizontal tab navigation */}
      <div className="mb-6 border-b border-border">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon
                    className="size-[18px]"
                    weight={isActive ? "fill" : "regular"}
                  />
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Nested page content */}
      <Outlet />
    </div>
  );
}
