import { Button } from "../ui";
import type { ExtensionManifest } from "../../lib/api";

interface Props {
  manifest: ExtensionManifest | null;
  value: Record<string, unknown>;
  fieldErrors?: Record<string, string>;
  saving?: boolean;
  onChange: (value: Record<string, unknown>) => void;
  onSave: () => void;
}

export function ExtensionConfigForm({
  manifest,
  value,
  fieldErrors,
  saving,
  onChange,
  onSave,
}: Props) {
  const properties = manifest?.schema?.properties ?? {};
  const keys = Object.keys(properties);

  if (keys.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface/20 p-4 text-sm text-muted">
        This extension does not publish a config schema.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {keys.map((key) => {
        const field = properties[key] ?? {};
        const raw = value[key];
        const current = typeof raw === "string" ? raw : raw === undefined ? "" : JSON.stringify(raw);

        return (
          <label key={key} className="block space-y-1">
            <span className="text-sm font-medium text-fg">
              {field.title ?? key}
            </span>
            {field.description ? (
              <span className="block text-xs text-muted">{field.description}</span>
            ) : null}
            <input
              value={current}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
            {fieldErrors?.[key] ? (
              <span className="block text-xs text-status-err">{fieldErrors[key]}</span>
            ) : null}
          </label>
        );
      })}

      <Button onClick={onSave} loading={saving} variant="primary">
        Save config
      </Button>
    </div>
  );
}
