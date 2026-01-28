import { FolderIcon, InfoIcon } from "@phosphor-icons/react";

export function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold">Settings</h1>
      <p className="mb-8 text-(--color-muted-foreground)">Server configuration and information.</p>

      {/* Server info */}
      <div className="rounded-lg border border-(--color-border) bg-(--color-card) p-4">
        <h2 className="mb-4 flex items-center gap-2 font-medium">
          <InfoIcon className="size-5" />
          Server Information
        </h2>

        <dl className="space-y-4">
          <div>
            <dt className="text-sm text-(--color-muted-foreground)">Version</dt>
            <dd className="font-mono">0.1.0</dd>
          </div>

          <div>
            <dt className="mb-1 flex items-center gap-2 text-sm text-(--color-muted-foreground)">
              <FolderIcon className="size-4" />
              Data Directory
            </dt>
            <dd className="rounded bg-(--color-muted) px-2 py-1 font-mono text-sm">
              ~/.pi-relay
            </dd>
          </div>
        </dl>
      </div>

      {/* Placeholder for future settings */}
      <div className="mt-6 rounded-lg border border-dashed border-(--color-border) p-8 text-center">
        <p className="text-(--color-muted-foreground)">
          Additional settings (default model, LLM API keys) will be available in a future update.
        </p>
      </div>
    </div>
  );
}
