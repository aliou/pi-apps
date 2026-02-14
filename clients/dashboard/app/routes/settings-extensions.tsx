import { PackageIcon, PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { ActionSplitButton, Button, Tabs } from "../components/ui";
import { api, type ExtensionConfig, type ExtensionScope } from "../lib/api";

type ScopeTab = "global" | "chat" | "code";

function AddPackageForm({
  scope,
  onAdded,
}: {
  scope: ScopeTab;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pkg, setPkg] = useState("");
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPackage = async (validate: boolean) => {
    if (!pkg.trim()) return;

    setSaving(true);
    setError(null);

    const res = await api.post<ExtensionConfig>("/extension-configs", {
      scope,
      package: pkg.trim(),
      validate,
    });

    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setPkg("");
    setOpen(false);
    onAdded();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitPackage(true);
  };

  const handleCancelValidation = async () => {
    setCanceling(true);
    const res = await api.post<{ canceled: boolean }>(
      "/extension-configs/validation/cancel",
      {},
    );
    setCanceling(false);
    if (res.error) {
      setError(res.error);
    }
  };

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        className="border-dashed"
      >
        <PlusIcon className="size-4" />
        Add package
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-surface/30 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-fg">
          Add extension package
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            setPkg("");
            setError(null);
          }}
          className="text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-xs text-muted">Package</span>
        <input
          type="text"
          value={pkg}
          disabled={saving}
          onChange={(e) => setPkg(e.target.value)}
          placeholder="npm:@scope/package@version or git:github.com/user/repo@tag"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <p className="mt-1.5 text-xs text-muted">
        Pi auto-installs packages on session startup. Use{" "}
        <code className="rounded bg-bg px-1 py-0.5 text-[11px]">npm:</code> for
        npm packages or{" "}
        <code className="rounded bg-bg px-1 py-0.5 text-[11px]">git:</code> for
        git repos.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        {saving ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={canceling}
            onClick={() => void handleCancelValidation()}
          >
            {canceling ? "Canceling..." : "Cancel"}
          </Button>
        ) : null}
        <ActionSplitButton.Root>
          <ActionSplitButton.Main
            type="submit"
            loading={saving}
            disabled={saving || !pkg.trim()}
            variant="primary"
            size="md"
          >
            Add
          </ActionSplitButton.Main>
          <ActionSplitButton.Menu disabled={saving || !pkg.trim()}>
            <ActionSplitButton.Item
              value="add-without-validation"
              onSelect={() => void submitPackage(false)}
              description="Skips package validation. Validation starts a Gondolin VM and installs the package, which can take some time."
            >
              Add without validation
            </ActionSplitButton.Item>
          </ActionSplitButton.Menu>
        </ActionSplitButton.Root>
      </div>
    </form>
  );
}

function PackageRow({
  config,
  onDelete,
}: {
  config: ExtensionConfig;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    onDelete(config.id);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/30 px-4 py-3">
      <PackageIcon className="size-5 shrink-0 text-accent" weight="duotone" />
      <span className="flex-1 truncate font-mono text-sm text-fg">
        {config.package}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
        title="Remove"
      >
        <TrashIcon className="size-4" />
      </button>
    </div>
  );
}

const SCOPE_DESCRIPTIONS: Record<ScopeTab, string> = {
  global: "Applied to all sessions regardless of mode.",
  chat: "Applied only to chat sessions.",
  code: "Applied only to code sessions.",
};

export default function ExtensionsPage() {
  const [configs, setConfigs] = useState<ExtensionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeTab>("global");

  const loadConfigs = useCallback(async (s: ExtensionScope) => {
    setLoading(true);
    const res = await api.get<ExtensionConfig[]>(
      `/extension-configs?scope=${s}`,
    );
    if (res.error) {
      setError(res.error);
      setConfigs([]);
    } else if (res.data) {
      setConfigs(res.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConfigs(scope);
  }, [scope, loadConfigs]);

  const handleDelete = async (id: string) => {
    const res = await api.delete<{ ok: boolean }>(`/extension-configs/${id}`);
    if (res.error) {
      alert(`Failed to remove: ${res.error}`);
      return;
    }
    await loadConfigs(scope);
  };

  const globalCount = useCountForScope("global");
  const chatCount = useCountForScope("chat");
  const codeCount = useCountForScope("code");

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <PackageIcon className="size-[18px]" weight="bold" />
          Extensions
        </h2>
      </div>
      <p className="mb-4 text-xs text-muted">
        Configure Pi extension packages. Packages are auto-installed when a
        session starts. Active sessions need a restart to pick up changes.
      </p>

      <Tabs
        value={scope}
        onValueChange={(details) => setScope(details.value as ScopeTab)}
        className="mb-4"
      >
        <Tabs.List className="gap-1 rounded-lg border border-border bg-bg p-1">
          <Tabs.Trigger
            value="global"
            className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Global
            <span className="ml-0.5 text-muted">{globalCount}</span>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="chat"
            className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Chat
            <span className="ml-0.5 text-muted">{chatCount}</span>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="code"
            className="relative z-10 gap-1.5 rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Code
            <span className="ml-0.5 text-muted">{codeCount}</span>
          </Tabs.Trigger>
          <Tabs.Indicator className="top-1 bottom-1 rounded-md bg-surface" />
        </Tabs.List>
      </Tabs>

      <p className="mb-4 text-xs text-muted">{SCOPE_DESCRIPTIONS[scope]}</p>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
          {error}
        </div>
      ) : (
        <>
          {configs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">
              No {scope === "global" ? "" : `${scope} `}extension packages
              configured.
            </div>
          ) : (
            <div className="space-y-2">
              {configs.map((c) => (
                <PackageRow key={c.id} config={c} onDelete={handleDelete} />
              ))}
            </div>
          )}

          <div className="mt-4">
            <AddPackageForm
              key={scope}
              scope={scope}
              onAdded={() => loadConfigs(scope)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Small hook that fetches count for a scope independently so we can show
 * counts on all tabs without re-fetching the active list.
 */
function useCountForScope(scope: ExtensionScope): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ExtensionConfig[]>(`/extension-configs?scope=${scope}`)
      .then((res) => {
        if (!cancelled && res.data) {
          setCount(res.data.length);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return count;
}
