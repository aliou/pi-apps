import { XIcon } from "@phosphor-icons/react";
import type { ExtensionConfigRecord, ExtensionManifest } from "../../lib/api";
import { Dialog } from "../ui";
import { ExtensionConfigForm } from "./extension-config-form";

interface Props {
  open: boolean;
  item: ExtensionConfigRecord | null;
  draftConfig: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (next: Record<string, unknown>) => void;
  onSave: () => void;
}

function CapabilityList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </h4>
      {values.length === 0 ? (
        <p className="mt-1 text-sm text-muted">None declared.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-md border border-border bg-surface/30 px-2 py-1 text-xs text-fg"
            >
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExtensionDetailsDrawer({
  open,
  item,
  draftConfig,
  fieldErrors,
  saving,
  onOpenChange,
  onDraftChange,
  onSave,
}: Props) {
  const manifest: ExtensionManifest | null = item?.manifest ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner className="justify-end">
          <Dialog.Content className="h-full max-h-screen w-full max-w-2xl overflow-y-auto rounded-none border-l border-border p-0">
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <Dialog.Title>{item?.package ?? "Extension"}</Dialog.Title>
                <Dialog.Description>
                  {manifest?.description ??
                    "Inspect package metadata, skills, providers, and config."}
                </Dialog.Description>
              </div>
              <Dialog.CloseTrigger aria-label="Close">
                <XIcon className="size-4" />
              </Dialog.CloseTrigger>
            </div>

            <div className="space-y-6 px-6 py-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-surface/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Package
                  </div>
                  <div className="mt-1 text-sm text-fg">{item?.package}</div>
                </div>
                <div className="rounded-lg border border-border bg-surface/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted">
                    Version
                  </div>
                  <div className="mt-1 text-sm text-fg">
                    {manifest?.version ?? "Unknown"}
                  </div>
                </div>
              </div>

              <CapabilityList label="Tools" values={manifest?.tools ?? []} />
              <CapabilityList
                label="Providers"
                values={manifest?.providers ?? []}
              />
              <CapabilityList label="Skills" values={manifest?.skills ?? []} />

              <div>
                <h3 className="mb-3 text-sm font-semibold text-fg">
                  Configuration
                </h3>
                <ExtensionConfigForm
                  manifest={manifest}
                  value={draftConfig}
                  fieldErrors={fieldErrors}
                  saving={saving}
                  onChange={onDraftChange}
                  onSave={onSave}
                />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
