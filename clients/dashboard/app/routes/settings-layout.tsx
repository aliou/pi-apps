import { CubeIcon, GearIcon, GithubLogoIcon, KeyIcon } from "@phosphor-icons/react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Tabs } from "../components/ui";

const tabs = [
  { value: "secrets", label: "Secrets", icon: KeyIcon },
  { value: "github", label: "GitHub", icon: GithubLogoIcon },
  { value: "environments", label: "Environments", icon: CubeIcon },
];

export default function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive active tab value from pathname
  const activeValue = location.pathname.split("/")[2] || "secrets";

  const handleValueChange = (details: { value: string }) => {
    navigate(`/settings/${details.value}`);
  };

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
      <Tabs
        value={activeValue}
        onValueChange={handleValueChange}
        className="mb-6"
      >
        <Tabs.List className="rounded-lg border border-border bg-bg p-1">
          {tabs.map((tab) => {
            const isActive = activeValue === tab.value;
            return (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className="relative z-10 rounded-md border-b-0 px-3 py-2"
              >
                <tab.icon
                  className="size-[18px]"
                  weight={isActive ? "fill" : "regular"}
                />
                {tab.label}
              </Tabs.Trigger>
            );
          })}
          <Tabs.Indicator className="top-1 bottom-1 rounded-md bg-surface" />
        </Tabs.List>
      </Tabs>

      {/* Nested page content */}
      <Outlet />
    </div>
  );
}
