import {
  CheckCircleIcon,
  CircleIcon,
  CloudIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
  FloppyDiskIcon,
  InfoIcon,
  KeyIcon,
  PlusIcon,
  TerminalIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { api, type SandboxProviderStatus } from "../lib/api";

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
}

interface CreateSecretBody {
  name: string;
  envVar: string;
  kind: SecretKind;
  value: string;
  enabled?: boolean;
}

interface UpdateSecretBody {
  name?: string;
  envVar?: string;
  kind?: SecretKind;
  enabled?: boolean;
  value?: string;
}

// --- Filter tabs ---

type KindFilter = "all" | "ai_provider" | "env_var";

// --- Add Secret Form ---

function AddSecretForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [envVar, setEnvVar] = useState("");
  const [kind, setKind] = useState<SecretKind>("ai_provider");
  const [value, setValue] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setEnvVar("");
    setKind("ai_provider");
    setValue("");
    setEnabled(true);
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
    };

    const res = await api.post<SecretInfo>("/secrets", body);
    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    reset();
    setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <PlusIcon className="size-4" />
        Add secret
      </button>
    );
  }

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
            setOpen(false);
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
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SecretKind)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
          >
            <option value="ai_provider">AI Provider</option>
            <option value="env_var">Env Var</option>
          </select>
        </label>
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

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <FloppyDiskIcon className="size-4" />
          {saving ? "Creating..." : "Create"}
        </button>
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
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

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
                : "bg-purple-500/10 text-purple-500"
            }`}
          >
            {secret.kind === "ai_provider" ? "AI Provider" : "Env Var"}
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
          <div className="relative flex-1">
            <input
              type={showValue ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="(enter new value)"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 pr-10 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowValue(!showValue)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            >
              {showValue ? (
                <EyeSlashIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <FloppyDiskIcon className="size-4" />
            {saving ? "Saving..." : "Save"}
          </button>

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

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Sandbox Providers Section ---

function SandboxProvidersSection() {
  const [status, setStatus] = useState<SandboxProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfToken, setCfToken] = useState("");
  const [showCfToken, setShowCfToken] = useState(false);
  const [cfConfigured, setCfConfigured] = useState(false);
  const [savingCf, setSavingCf] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const [cfSuccess, setCfSuccess] = useState(false);
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);

  const loadStatus = useCallback(async () => {
    const res = await api.get<SandboxProviderStatus>(
      "/settings/sandbox-providers",
    );
    if (res.data) {
      setStatus(res.data);
    }
    setLoading(false);
  }, []);

  const loadSecrets = useCallback(async () => {
    const res = await api.get<SecretInfo[]>("/secrets");
    if (res.data) {
      setSecrets(res.data);
      const cfSecret = res.data.find(
        (s) => s.envVar === "SANDBOX_CF_API_TOKEN",
      );
      setCfConfigured(!!cfSecret);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadSecrets();
  }, [loadStatus, loadSecrets]);

  const handleSaveCfToken = async () => {
    if (!cfToken.trim()) return;

    setSavingCf(true);
    setCfError(null);
    setCfSuccess(false);

    // Verify token with Cloudflare before saving
    const verifyRes = await api.post<{
      valid: boolean;
      error?: string;
      expiresOn?: string;
    }>("/settings/verify-cf-token", { token: cfToken.trim() });

    if (verifyRes.error) {
      setCfError(verifyRes.error);
      setSavingCf(false);
      return;
    }

    if (!verifyRes.data?.valid) {
      setCfError(verifyRes.data?.error ?? "Invalid token");
      setSavingCf(false);
      return;
    }

    // Token is valid, save it
    const cfSecret = secrets.find((s) => s.envVar === "SANDBOX_CF_API_TOKEN");

    try {
      if (cfSecret) {
        const body: UpdateSecretBody = { value: cfToken.trim() };
        const res = await api.put<{ ok: boolean }>(
          `/secrets/${cfSecret.id}`,
          body,
        );
        if (res.error) {
          setCfError(res.error);
        } else {
          setCfSuccess(true);
          setCfToken("");
          await loadSecrets();
          await loadStatus();
          setTimeout(() => setCfSuccess(false), 2000);
        }
      } else {
        const body: CreateSecretBody = {
          name: "Cloudflare API Token",
          envVar: "SANDBOX_CF_API_TOKEN",
          kind: "sandbox_provider",
          value: cfToken.trim(),
          enabled: true,
        };
        const res = await api.post<SecretInfo>("/secrets", body);
        if (res.error) {
          setCfError(res.error);
        } else {
          setCfSuccess(true);
          setCfToken("");
          await loadSecrets();
          await loadStatus();
          setTimeout(() => setCfSuccess(false), 2000);
        }
      }
    } finally {
      setSavingCf(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <CubeIcon className="size-[18px]" weight="bold" />
          Sandbox Providers
        </h2>
        <div className="mt-4 text-center text-sm text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-fg">
        <CubeIcon className="size-[18px]" weight="bold" />
        Sandbox Providers
      </h2>

      <div className="space-y-4">
        {/* Docker */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <CubeIcon className="size-5" weight="bold" />
            </div>
            <div>
              <div className="text-sm font-medium text-fg">Docker</div>
              <div className="text-xs text-muted">
                Local daemon availability
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CircleIcon
              className={`size-3 weight-fill ${
                status?.docker.available ? "text-green-500" : "text-red-500"
              }`}
              weight="fill"
            />
            <span className="text-sm text-muted">
              {status?.docker.available ? "Available" : "Not available"}
            </span>
          </div>
        </div>

        {/* Cloudflare */}
        <div className="rounded-lg border border-border bg-surface/30 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
              <CloudIcon className="size-5" weight="bold" />
            </div>
            <div>
              <div className="text-sm font-medium text-fg">Cloudflare</div>
              <div className="text-xs text-muted">Workers API token</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {cfConfigured && !cfToken && (
              <div className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500 w-fit">
                <CheckCircleIcon className="size-3" weight="fill" />
                Configured
              </div>
            )}

            <div className="relative flex gap-2">
              <input
                type={showCfToken ? "text" : "password"}
                value={cfToken}
                onChange={(e) => setCfToken(e.target.value)}
                placeholder={
                  cfConfigured
                    ? "Enter new token to update..."
                    : "Enter API token..."
                }
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 pr-10 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowCfToken(!showCfToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              >
                {showCfToken ? (
                  <EyeSlashIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>

            {cfError && <div className="text-xs text-red-500">{cfError}</div>}
            {cfSuccess && (
              <div className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircleIcon className="size-3" weight="fill" />
                {cfConfigured ? "Token updated" : "Token configured"}
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveCfToken}
              disabled={!cfToken.trim() || savingCf}
              className="w-fit flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <FloppyDiskIcon className="size-4" />
              {savingCf ? "Saving..." : cfConfigured ? "Update" : "Configure"}
            </button>
          </div>
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          API keys and server configuration.
        </p>
      </div>

      {/* Sandbox Providers Section */}
      <SandboxProvidersSection />

      {/* Secrets Section */}
      <div className="mt-6 rounded-xl border border-border bg-surface/50 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <KeyIcon className="size-[18px]" weight="bold" />
            Secrets
          </h2>
        </div>
        <p className="mb-4 text-xs text-muted">
          Keys are encrypted at rest (AES-256-GCM) and injected into sandbox
          containers.
        </p>

        {/* Kind filter tabs */}
        <div className="mb-4 flex gap-1 rounded-lg border border-border bg-bg p-1">
          {(
            [
              { key: "all", label: "All", count: secrets.length },
              {
                key: "ai_provider",
                label: "AI Providers",
                icon: KeyIcon,
                count: aiCount,
              },
              {
                key: "env_var",
                label: "Env Vars",
                icon: TerminalIcon,
                count: envCount,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setKindFilter(tab.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                kindFilter === tab.key
                  ? "bg-surface text-fg shadow-sm"
                  : "text-muted hover:text-fg"
              }`}
            >
              {"icon" in tab && tab.icon && (
                <tab.icon className="size-3.5" weight="bold" />
              )}
              {tab.label}
              <span className="ml-0.5 text-muted">{tab.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted">Loading...</div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
            {error}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  {kindFilter === "all"
                    ? "No secrets configured."
                    : `No ${kindFilter === "ai_provider" ? "AI provider" : "env var"} secrets.`}
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

            <div className="mt-4">
              <AddSecretForm onCreated={loadSecrets} />
            </div>
          </>
        )}
      </div>

      {/* Server info */}
      <div className="mt-6 rounded-xl border border-border bg-surface/50 p-5">
        <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold text-fg">
          <InfoIcon className="size-[18px]" weight="bold" />
          Server Information
        </h2>

        <dl className="space-y-4">
          <div>
            <dt className="text-xs font-medium text-muted">Version</dt>
            <dd className="mt-1 font-mono text-sm text-fg">0.1.0</dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted">Secrets</dt>
            <dd className="mt-1 text-sm text-green-500">
              Enabled (AES-256-GCM encrypted)
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
