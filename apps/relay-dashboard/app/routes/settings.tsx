import { FolderIcon, InfoIcon } from "@phosphor-icons/react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-(--color-fg)">Settings</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          Server configuration and information.
        </p>
      </div>

      {/* Server info */}
      <div className="rounded-xl border border-(--color-border) bg-(--color-surface)/50 p-5">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-(--color-fg)">
          <InfoIcon className="size-[18px]" weight="bold" />
          Server Information
        </h2>

        <dl className="space-y-5">
          <div>
            <dt className="text-xs font-medium text-(--color-muted)">
              Version
            </dt>
            <dd className="mt-1 font-mono text-sm text-(--color-fg)">0.1.0</dd>
          </div>

          <div>
            <dt className="mb-1.5 flex items-center gap-2 text-xs font-medium text-(--color-muted)">
              <FolderIcon className="size-4" />
              Data Directory
            </dt>
            <dd className="rounded-lg bg-(--color-surface) px-3 py-2 font-mono text-xs text-(--color-muted)">
              ~/.local/share/pi-relay
            </dd>
          </div>
        </dl>
      </div>

      {/* Placeholder */}
      <div className="mt-8 rounded-xl border border-dashed border-(--color-border) py-14 text-center">
        <p className="text-sm text-(--color-muted)/50">
          Default model, LLM API keys, and other settings will be available in a
          future update.
        </p>
      </div>
    </div>
  );
}
