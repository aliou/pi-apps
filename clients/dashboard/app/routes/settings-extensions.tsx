import {
  MagnifyingGlassIcon,
  PackageIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ExtensionDetailsDrawer } from "../components/extensions/extension-details-drawer";
import { ActionSplitButton, Button, Tabs } from "../components/ui";
import {
  api,
  type CatalogPackage,
  type ExtensionConfigRecord,
  type ExtensionScope,
  type PackageCatalogResponse,
} from "../lib/api";

const SCOPES: ExtensionScope[] = ["global", "chat", "code"];
type ViewTab = "installed" | "discover" | "skills";

function parseConfig(configJson?: string | null): Record<string, unknown> {
  if (!configJson) return {};
  try {
    const parsed = JSON.parse(configJson) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function AddPackageForm({
  scope,
  onAdded,
}: {
  scope: ExtensionScope;
  onAdded: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [pkg, setPkg] = useState("");
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitPackage = async (validate: boolean) => {
    const trimmed = pkg.trim();
    if (!trimmed) return;

    setSaving(true);
    setError(null);

    const res = await api.post<ExtensionConfigRecord>("/extension-configs", {
      scope,
      package: trimmed,
      validate,
    });

    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setPkg("");
    setOpen(false);
    await onAdded();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-xl border border-border bg-surface/20 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
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

      {error ? (
        <div className="mb-3 rounded-lg border border-status-err/20 bg-status-err/5 px-3 py-2 text-sm text-status-err">
          {error}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-xs text-muted">Package reference</span>
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
        Use this for packages that are not in the discover catalog yet. The
        relay stores the full package reference, including
        <code className="rounded bg-bg px-1 py-0.5 text-[11px]">npm:</code>
        or
        <code className="rounded bg-bg px-1 py-0.5 text-[11px]">git:</code>.
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

export default function ExtensionsPage() {
  const [view, setView] = useState<ViewTab>("installed");
  const [scope, setScope] = useState<ExtensionScope>("global");
  const [configs, setConfigs] = useState<ExtensionConfigRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogPackage[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<{
    fetchedAt: string | null;
    stale: boolean;
  }>({
    fetchedAt: null,
    stale: false,
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ExtensionConfigRecord | null>(null);
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadInstalled = useCallback(async (activeScope: ExtensionScope) => {
    setLoading(true);
    const res = await api.get<ExtensionConfigRecord[]>(
      `/extension-configs?scope=${activeScope}`,
    );
    if (res.error) {
      setError(res.error);
      setConfigs([]);
    } else {
      setError(null);
      setConfigs(res.data ?? []);
    }
    setLoading(false);
  }, []);

  const loadCatalog = useCallback(async (search = "") => {
    setLoading(true);
    const res = await api.get<PackageCatalogResponse>(
      `/packages?tag=pi-package&limit=24&query=${encodeURIComponent(search)}`,
    );
    if (res.error) {
      setError(res.error);
      setCatalog([]);
    } else {
      setError(null);
      setCatalog(res.data?.packages ?? []);
      setCatalogMeta({
        fetchedAt: res.data?.fetchedAt ?? null,
        stale: res.data?.stale ?? false,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (view === "installed" || view === "skills") {
      void loadInstalled(scope);
    } else {
      void loadCatalog(query);
    }
  }, [view, scope, loadInstalled, loadCatalog, query]);

  const installedNames = useMemo(
    () => new Set(configs.map((item) => item.package)),
    [configs],
  );

  const skills = useMemo(() => {
    return configs.flatMap((item) =>
      (item.manifest?.skills ?? []).map((skill) => ({
        skill,
        package: item.package,
        description: item.manifest?.description,
      })),
    );
  }, [configs]);

  const handleInstall = async (pkg: string) => {
    setSaving(true);
    setError(null);
    const res = await api.post<ExtensionConfigRecord>("/extension-configs", {
      scope,
      package: pkg,
      validate: false,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    await loadInstalled(scope);
    setView("installed");
  };

  const handleDelete = async (id: string) => {
    const res = await api.delete<{ ok: boolean }>(`/extension-configs/${id}`);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (selected?.id === id) {
      setSelected(null);
      setDraftConfig({});
      setFieldErrors({});
    }
    await loadInstalled(scope);
  };

  const openDetails = (item: ExtensionConfigRecord) => {
    setSelected(item);
    setDraftConfig(parseConfig(item.configJson));
    setFieldErrors({});
  };

  const handleSaveConfig = async () => {
    if (!selected) return;
    setSaving(true);
    setFieldErrors({});
    const res = await api.put<ExtensionConfigRecord>(
      `/extension-configs/${selected.id}`,
      {
        config: draftConfig,
      },
    );
    setSaving(false);
    if (res.error) {
      setError(res.error);
      const meta = (
        res as {
          meta?: { fieldErrors?: Array<{ field: string; message: string }> };
        }
      ).meta;
      const nextErrors = Object.fromEntries(
        (meta?.fieldErrors ?? []).map((entry) => [entry.field, entry.message]),
      );
      setFieldErrors(nextErrors);
      return;
    }
    setError(null);
    setSelected(res.data ?? selected);
    await loadInstalled(scope);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <PackageIcon className="size-5" weight="bold" />
          Extensions
        </h2>
        <p className="mt-1 text-sm text-muted">
          Discover Pi packages, inspect package metadata, and store extension
          config by scope.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCOPES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setScope(item)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              scope === item
                ? "border-accent bg-accent/10 text-fg"
                : "border-border bg-surface/20 text-muted"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <Tabs
        value={view}
        onValueChange={(details) => setView(details.value as ViewTab)}
      >
        <Tabs.List className="gap-1 rounded-lg border border-border bg-bg p-1">
          <Tabs.Trigger
            value="installed"
            className="rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Installed
          </Tabs.Trigger>
          <Tabs.Trigger
            value="discover"
            className="rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Discover
          </Tabs.Trigger>
          <Tabs.Trigger
            value="skills"
            className="rounded-md border-none px-3 py-1.5 text-xs data-[selected]:text-fg"
          >
            Skills
          </Tabs.Trigger>
          <Tabs.Indicator className="top-1 bottom-1 rounded-md bg-surface" />
        </Tabs.List>
      </Tabs>

      {error ? (
        <div className="rounded-lg border border-status-err/20 bg-status-err/5 px-3 py-2 text-sm text-status-err">
          {error}
        </div>
      ) : null}

      {view === "discover" ? (
        <div className="space-y-4">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface/20 px-3 py-2">
            <MagnifyingGlassIcon className="size-4 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pi-package catalog"
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
          </label>
          {catalogMeta.fetchedAt ? (
            <p className="text-xs text-muted">
              {catalogMeta.stale
                ? "Showing cached results."
                : "Catalog refreshed."}{" "}
              {catalogMeta.fetchedAt}
            </p>
          ) : null}
          {loading ? (
            <div className="py-8 text-sm text-muted">Loading…</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {catalog.map((pkg) => (
                <div
                  key={pkg.name}
                  className="rounded-xl border border-border bg-surface/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">
                        {pkg.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {pkg.description ?? "No description."}
                      </p>
                    </div>
                    <Button
                      variant={
                        installedNames.has(pkg.name) ? "secondary" : "primary"
                      }
                      size="sm"
                      loading={saving}
                      disabled={installedNames.has(pkg.name)}
                      onClick={() => void handleInstall(pkg.name)}
                    >
                      {installedNames.has(pkg.name) ? "Installed" : "Install"}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(pkg.extensionMeta?.tools ?? []).map((value) => (
                      <span
                        key={value}
                        className="rounded-md border border-border px-2 py-1 text-xs text-fg"
                      >
                        tool:{value}
                      </span>
                    ))}
                    {(pkg.extensionMeta?.providers ?? []).map((value) => (
                      <span
                        key={value}
                        className="rounded-md border border-border px-2 py-1 text-xs text-fg"
                      >
                        provider:{value}
                      </span>
                    ))}
                    {(pkg.extensionMeta?.skills ?? []).map((value) => (
                      <span
                        key={value}
                        className="rounded-md border border-border px-2 py-1 text-xs text-fg"
                      >
                        skill:{value}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {view === "installed" ? (
        <AddPackageForm scope={scope} onAdded={() => loadInstalled(scope)} />
      ) : null}
      {view === "installed" ? (
        loading ? (
          <div className="py-8 text-sm text-muted">Loading…</div>
        ) : configs.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed bg-surface/10 p-6 text-sm text-muted">
            No extensions installed for {scope}.
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface/20 p-4"
              >
                <SparkleIcon className="size-5 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg">
                    {item.package}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {item.manifest?.description ??
                      "Package metadata unavailable. Install still allowed."}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openDetails(item)}
                >
                  Details
                </Button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="rounded-md p-2 text-muted hover:bg-status-err/10 hover:text-status-err"
                >
                  <TrashIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : null}

      {view === "skills" ? (
        loading ? (
          <div className="py-8 text-sm text-muted">Loading…</div>
        ) : skills.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed bg-surface/10 p-6 text-sm text-muted">
            No skills exposed by installed extensions in this scope.
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((item) => (
              <div
                key={`${item.package}:${item.skill}`}
                className="rounded-xl border border-border bg-surface/20 p-4"
              >
                <div className="flex items-start gap-3">
                  <WrenchIcon className="mt-0.5 size-5 text-accent" />
                  <div>
                    <div className="text-sm font-semibold text-fg">
                      {item.skill}
                    </div>
                    <div className="text-xs text-muted">
                      Exposed by {item.package}
                    </div>
                    {item.description ? (
                      <p className="mt-2 text-sm text-muted">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      <ExtensionDetailsDrawer
        open={Boolean(selected)}
        item={selected}
        draftConfig={draftConfig}
        fieldErrors={fieldErrors}
        saving={saving}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDraftConfig({});
            setFieldErrors({});
          }
        }}
        onDraftChange={setDraftConfig}
        onSave={() => void handleSaveConfig()}
      />
    </div>
  );
}
