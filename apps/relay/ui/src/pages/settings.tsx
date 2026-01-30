import { FolderIcon, InfoIcon } from "@phosphor-icons/react";

export function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-(--color-foreground)">Settings</h1>
        <p className="text-sm text-(--color-muted)">Server configuration and information.</p>
      </div>

      {/* Server info */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-surface)/50 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-(--color-foreground)">
          <InfoIcon className="size-4" weight="bold" />
          Server Information
        </h2>

        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-(--color-muted)">Version</dt>
            <dd className="font-mono text-sm text-(--color-foreground)">0.1.0</dd>
          </div>

          <div>
            <dt className="mb-1 flex items-center gap-1.5 text-xs text-(--color-muted)">
              <FolderIcon className="size-3.5" />
              Data Directory
            </dt>
            <dd className="rounded-md bg-(--color-surface) px-2.5 py-1.5 font-mono text-xs text-(--color-muted)">
              ~/.local/share/pi-relay
            </dd>
          </div>
        </dl>
      </div>

      {/* Placeholder */}
      <div className="mt-6 rounded-lg border border-dashed border-(--color-border) py-12 text-center">
        <p className="text-sm text-(--color-muted)/60">
          Default model, LLM API keys, and other settings will be available in a future update.
        </p>
      </div>
    </div>
  );
}
