import { GearIcon } from "@phosphor-icons/react";
import { Outlet } from "react-router";

export default function SettingsLayout() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <GearIcon className="size-6" weight="bold" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Configure API keys, integrations, and environments.
        </p>
      </div>

      <Outlet />
    </div>
  );
}
