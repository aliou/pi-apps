import {
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CubeIcon,
  FloppyDiskIcon,
  KeyIcon,
  MinusIcon,
  PlusIcon,
  TerminalIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button, Select, Tabs } from "../components/ui";
import { api } from "../lib/api";

// --- Types matching Phase 1 backend ---

type SecretKind = "ai_provider" | "env_var" | "sandbox_provider";

interface SecretInfo {
  id: string;
  name: string;
  envVar: string;
  kind: SecretKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  keyVersion: number;
  domains?: string[];
}

interface CreateSecretBody {
  name: string;
  envVar: string;
  kind: SecretKind;
  value: string;
  enabled?: boolean;
  domains?: string[];
}

interface UpdateSecretBody {
  name?: string;
  envVar?: string;
  kind?: SecretKind;
  enabled?: boolean;
  value?: string;
  domains?: string[];
}

// --- Filter tabs ---

type KindFilter = "all" | "ai_provider" | "env_var" | "sandbox_provider";

const secretKindOptions = [
  {
    value: "ai_provider",
    label: "AI Provider",
    description: "Model provider credentials",
  },
  {
    value: "env_var",
    label: "Env Var",
    description: "General environment variable",
  },
  {
    value: "sandbox_provider",
    label: "Sandbox",
    description: "Sandbox provider credentials",
  },
] as const;

// --- Domain Restrictions Editor ---

function DomainRestrictionsEditor({
  domains,
  onDomainsChange,
  saving,
  persistedDomains: persistedDomainsInitial,
}: {
  domains: string[];
  onDomainsChange: (domains: string[]) => void;
  saving?: boolean;
  persistedDomains?: string[];
}) {
  const [open, setOpen] = useState(domains.length > 0);
  const [newDomain, setNewDomain] = useState("");
  const persistedDomains = new Set(persistedDomainsInitial ?? domains);

  const handleAdd = () => {
    const val = newDomain.trim().toLowerCase();
    if (val && !domains.includes(val)) {
      onDomainsChange([...domains, val]);
    }
    setNewDomain("");
  };

  const handleRemove = (domain: string) => {
    onDomainsChange(domains.filter((d) => d !== domain));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-fg"
      >
        {open ? (
          <CaretDownIcon className="size-3" />
        ) : (
          <CaretRightIcon className="size-3" />
        )}
        Domain restrictions
        {!open && domains.length > 0 && (
          <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
            {domains.length}
          </span>
        )}
        {saving && <span className="text-muted/50">(saving...)</span>}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border/50 bg-bg/50 p-3">
          <p className="mb-3 text-xs text-muted">
            Only send this secret to matching hosts. Without restrictions, the
            secret is available as a plain environment variable.
          </p>

          <div className="flex flex-col gap-1.5">
            {domains.map((d) => (
              <div key={d} className="flex items-center gap-1">
                <input
                  type="text"
                  value={d}
                  readOnly
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-fg"
                />
                <button
                  type="button"
                  disabled
                  className="rounded-lg border border-border p-1.5 text-muted opacity-30"
                >
                  <PlusIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(d)}
                  disabled={!persistedDomains.has(d)}
                  className="rounded-lg border border-border p-1.5 text-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                >
                  <MinusIcon className="size-3.5" />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="api.example.com"
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newDomain.trim()}
                className="rounded-lg border border-border p-1.5 text-muted hover:bg-accent/10 hover:text-accent disabled:opacity-30"
              >
                <PlusIcon className="size-3.5" />
              </button>
              <button
                type="button"
                disabled
                className="rounded-lg border border-border p-1.5 text-muted opacity-30"
              >
                <MinusIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Add Secret Form ---

function AddSecretForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [envVar, setEnvVar] = useState("");
  const [kind, setKind] = useState<SecretKind>("ai_provider");
  const [value, setValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [domains, setDomains] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEnvVar("");
    setKind("ai_provider");
    setValue("");
    setEnabled(true);
    setDomains([]);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !envVar.trim() || !value.trim()) {
      setError("Name, env var, and value are required.");
      return;
    }

    setSaving(true);
    const body: CreateSecretBody = {
      name: name.trim(),
      envVar: envVar.trim(),
      kind,
      value: value.trim(),
      enabled,
      ...(domains.length > 0 ? { domains } : {}),
    };

    const res = await api.post<SecretInfo>("/secrets", body);
    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    reset();
    onCreated();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-surface/30 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">New secret</span>
        <button
          type="button"
          onClick={() => {
            reset();
            onCancel();
          }}
          className="text-muted hover:text-fg"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anthropic"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Env var</span>
          <input
            type="text"
            value={envVar}
            onChange={(e) => setEnvVar(e.target.value)}
            placeholder="ANTHROPIC_API_KEY"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs text-muted">Kind</span>
          <Select
            value={kind}
            onValueChange={(next) => setKind(next as SecretKind)}
            items={secretKindOptions.map((option) => ({ ...option }))}
            renderItem={(item) => (
              <div>
                <p className="truncate">{item.label}</p>
                <p className="truncate text-xs text-muted">
                  {item.description}
                </p>
              </div>
            )}
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-4 rounded border-border accent-accent"
            />
            Enabled
          </label>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-muted">Value</span>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
        />
      </label>

      <div className="mt-3">
        <DomainRestrictionsEditor
          domains={domains}
          onDomainsChange={setDomains}
        />
      </div>

      <div className="mt-4 flex justify-end">
        <Button type="submit" loading={saving} variant="primary" size="md">
          <FloppyDiskIcon className="size-4" />
          Create
        </Button>
      </div>
    </form>
  );
}

// --- Secret Row ---

function SecretRow({
  secret,
  onToggle,
  onUpdateValue,
  onDelete,
}: {
  secret: SecretInfo;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onUpdateValue: (id: string, value: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);
  const [domains, setDomains] = useState<string[]>(secret.domains ?? []);
  const [savingDomains, setSavingDomains] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setUpdateError(null);
    setUpdated(false);
    const err = await onUpdateValue(secret.id, value.trim());
    setSaving(false);
    if (err) {
      setUpdateError(err);
    } else {
      setValue("");
      setUpdated(true);
      setTimeout(() => setUpdated(false), 2000);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(secret.id, !secret.enabled);
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete secret "${secret.name}"?`)) return;
    setDeleting(true);
    await onDelete(secret.id);
    setDeleting(false);
  };

  const handleSaveDomains = async (newDomains: string[]) => {
    setSavingDomains(true);
    const body: UpdateSecretBody = { domains: newDomains };
    const res = await api.put<{ ok: boolean }>(`/secrets/${secret.id}`, body);
    setSavingDomains(false);
    if (res.error) {
      setUpdateError(res.error);
    } else {
      setDomains(newDomains);
    }
  };

  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-surface/30 p-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{secret.name}</span>
          <span className="rounded bg-bg px-1.5 py-0.5 font-mono text-xs text-muted">
            {secret.envVar}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              secret.kind === "ai_provider"
                ? "bg-blue-500/10 text-blue-500"
                : secret.kind === "sandbox_provider"
                  ? "bg-orange-500/10 text-orange-500"
                  : "bg-purple-500/10 text-purple-500"
            }`}
          >
            {secret.kind === "ai_provider"
              ? "AI Provider"
              : secret.kind === "sandbox_provider"
                ? "Sandbox"
                : "Env Var"}
          </span>
          {secret.enabled ? (
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
              <CheckCircleIcon className="size-3" weight="fill" />
              Enabled
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
              <WarningCircleIcon className="size-3" weight="fill" />
              Disabled
            </span>
          )}
          {domains.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-muted/10 px-2 py-0.5 text-xs text-muted">
              {domains.length} {domains.length === 1 ? "host" : "hosts"}
            </span>
          )}
        </div>

        {updateError && (
          <div className="mt-2 text-xs text-red-500">{updateError}</div>
        )}
        {updated && (
          <div className="mt-2 flex items-center gap-1 text-xs text-green-500">
            <CheckCircleIcon className="size-3" weight="fill" />
            Value updated
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="(enter new value)"
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
          />

          <Button
            onClick={handleSave}
            disabled={!value.trim()}
            loading={saving}
            variant="primary"
            size="md"
          >
            <FloppyDiskIcon className="size-4" />
            Save
          </Button>

          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            title={secret.enabled ? "Disable" : "Enable"}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              secret.enabled
                ? "border-green-500/30 text-green-500 hover:bg-green-500/10"
                : "border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            }`}
          >
            {secret.enabled ? (
              <ToggleRightIcon className="size-4" weight="fill" />
            ) : (
              <ToggleLeftIcon className="size-4" weight="fill" />
            )}
          </button>

          <Button
            onClick={handleDelete}
            loading={deleting}
            variant="danger"
            size="md"
            className="border border-red-500/30 bg-transparent text-red-500 hover:bg-red-500/10"
          >
            <TrashIcon className="size-4" />
          </Button>
        </div>

        <div className="mt-3">
          <DomainRestrictionsEditor
            domains={domains}
            onDomainsChange={(next) => {
              handleSaveDomains(next);
            }}
            saving={savingDomains}
          />
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function SettingsPage() {
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);

  const loadSecrets = useCallback(async () => {
    const res = await api.get<SecretInfo[]>("/secrets");
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSecrets(res.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  const handleToggle = async (id: string, enabled: boolean) => {
    const body: UpdateSecretBody = { enabled };
    const res = await api.put<{ ok: boolean }>(`/secrets/${id}`, body);
    if (res.error) {
      alert(`Failed to toggle: ${res.error}`);
    } else {
      await loadSecrets();
    }
  };

  const handleUpdateValue = async (
    id: string,
    value: string,
  ): Promise<string | null> => {
    const body: UpdateSecretBody = { value };
    const res = await api.put<{ ok: boolean }>(`/secrets/${id}`, body);
    if (res.error) {
      return res.error;
    }
    await loadSecrets();
    return null;
  };

  const handleDelete = async (id: string) => {
    const res = await api.delete<{ ok: boolean }>(`/secrets/${id}`);
    if (res.error) {
      alert(`Failed to delete: ${res.error}`);
    } else {
      await loadSecrets();
    }
  };

  const filtered =
    kindFilter === "all"
      ? secrets
      : secrets.filter((s) => s.kind === kindFilter);

  const aiCount = secrets.filter((s) => s.kind === "ai_provider").length;
  const envCount = secrets.filter((s) => s.kind === "env_var").length;
  const sandboxCount = secrets.filter(
    (s) => s.kind === "sandbox_provider",
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <KeyIcon className="size-5" weight="bold" />
          Secrets
        </h2>
        <p className="mt-1 text-sm text-muted">
          Keys are encrypted at rest (AES-256-GCM) and injected into sandbox
          containers.
        </p>
      </div>

      {/* Kind filter tabs + add button */}
      <div className="mb-4 flex items-center gap-2">
        <Tabs
          value={kindFilter}
          onValueChange={(details) =>
            setKindFilter(details.value as KindFilter)
          }
          className="flex-1"
        >
          <Tabs.List className="gap-1 rounded-lg border border-border bg-bg p-1">
            <Tabs.Trigger
              value="all"
              className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
            >
              All
              <span className="ml-0.5 text-muted">{secrets.length}</span>
            </Tabs.Trigger>
            <Tabs.Trigger
              value="ai_provider"
              className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
            >
              <KeyIcon className="size-3.5" weight="bold" />
              AI Providers
              <span className="ml-0.5 text-muted">{aiCount}</span>
            </Tabs.Trigger>
            <Tabs.Trigger
              value="env_var"
              className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
            >
              <TerminalIcon className="size-3.5" weight="bold" />
              Env Vars
              <span className="ml-0.5 text-muted">{envCount}</span>
            </Tabs.Trigger>
            <Tabs.Trigger
              value="sandbox_provider"
              className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
            >
              <CubeIcon className="size-3.5" weight="bold" />
              Sandbox
              <span className="ml-0.5 text-muted">{sandboxCount}</span>
            </Tabs.Trigger>
            <Tabs.Indicator className="top-1 bottom-1 rounded-md bg-surface" />
          </Tabs.List>
        </Tabs>

        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            showAddForm
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-border bg-bg text-muted hover:text-fg"
          }`}
        >
          <PlusIcon className="size-3.5" weight="bold" />
          Add secret
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          {showAddForm && (
            <AddSecretForm
              onCreated={() => {
                loadSecrets();
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {filtered.length === 0 && !showAddForm ? (
            <div className="py-6 text-center text-sm text-muted">
              {kindFilter === "all"
                ? "No secrets configured."
                : `No ${kindFilter === "ai_provider" ? "AI provider" : kindFilter === "sandbox_provider" ? "sandbox" : "env var"} secrets.`}
            </div>
          ) : (
            filtered.map((secret) => (
              <SecretRow
                key={secret.id}
                secret={secret}
                onToggle={handleToggle}
                onUpdateValue={handleUpdateValue}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
