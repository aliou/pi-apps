import {
  CheckCircleIcon,
  CloudIcon,
  CubeIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button, Dialog } from "../components/ui";
import {
  type AvailableImage,
  api,
  type CreateEnvironmentRequest,
  type Environment,
  type ProbeResult,
  type UpdateEnvironmentRequest,
} from "../lib/api";

interface SecretInfo {
  id: string;
  name: string;
  envVar: string;
  kind: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  keyVersion: number;
}

// -- Dialog Component -------------------------------------------------

function EnvironmentDialog({
  environment,
  images,
  open,
  onSave,
  onClose,
}: {
  environment?: Environment;
  images: AvailableImage[];
  open: boolean;
  onSave: (
    data: CreateEnvironmentRequest | UpdateEnvironmentRequest,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!environment;
  const [name, setName] = useState(environment?.name ?? "");
  const [sandboxType, setSandboxType] = useState<"docker" | "cloudflare">(
    environment?.sandboxType ?? "docker",
  );
  const [image, setImage] = useState(
    environment?.config.image ?? images[0]?.image ?? "",
  );
  const [workerUrl, setWorkerUrl] = useState(
    environment?.config.workerUrl ?? "",
  );
  const [secretId, setSecretId] = useState(environment?.config.secretId ?? "");
  const [isDefault, setIsDefault] = useState(environment?.isDefault ?? false);
  const [idleTimeout, setIdleTimeout] = useState(
    environment?.config.idleTimeoutSeconds ?? 3600,
  );
  const [saving, setSaving] = useState(false);
  const [probeStatus, setProbeStatus] = useState<
    null | "probing" | "available" | "unavailable"
  >(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);

  // Fetch secrets on mount
  useEffect(() => {
    const fetchSecrets = async () => {
      const res = await api.get<SecretInfo[]>("/secrets");
      if (res.data) {
        setSecrets(res.data);
      }
    };
    fetchSecrets();
  }, []);

  // Auto-probe availability when config changes (debounced)
  useEffect(() => {
    setProbeStatus(null);
    setProbeError(null);

    const isConfigComplete =
      (sandboxType === "docker" && !!image) ||
      (sandboxType === "cloudflare" && !!workerUrl.trim() && !!secretId);

    if (!isConfigComplete) return;

    let cancelled = false;

    const timeout = setTimeout(async () => {
      setProbeStatus("probing");

      const config =
        sandboxType === "docker" ? { image } : { workerUrl, secretId };

      const res = await api.post<ProbeResult>("/environments/probe", {
        sandboxType,
        config,
      });

      if (cancelled) return;

      if (res.error) {
        setProbeStatus("unavailable");
        setProbeError(res.error);
      } else if (res.data?.available) {
        setProbeStatus("available");
      } else {
        setProbeStatus("unavailable");
        setProbeError(res.data?.error ?? "Probe failed");
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [sandboxType, image, workerUrl, secretId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (sandboxType === "docker" && !image) return;
    if (sandboxType === "cloudflare" && (!workerUrl.trim() || !secretId))
      return;

    setSaving(true);
    try {
      const config =
        sandboxType === "docker"
          ? { image, idleTimeoutSeconds: idleTimeout }
          : { workerUrl, secretId };

      if (isEdit) {
        const update: UpdateEnvironmentRequest = {
          name: name.trim(),
          config,
          isDefault,
        };
        await onSave(update);
      } else {
        const create: CreateEnvironmentRequest = {
          name: name.trim(),
          sandboxType,
          config,
          isDefault,
        };
        await onSave(create);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>
              {isEdit ? "Edit Environment" : "Create Environment"}
            </Dialog.Title>
            <Dialog.CloseTrigger>
              <XIcon className="size-4" />
            </Dialog.CloseTrigger>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label
                htmlFor="env-name"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Name
              </label>
              <input
                id="env-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Default, Python Dev, Node.js"
                className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                required
              />
            </div>

            {/* Sandbox Type */}
            <div>
              <span className="mb-2.5 block text-xs font-medium text-muted">
                Sandbox Type
              </span>
              <div className="flex gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="docker"
                    checked={sandboxType === "docker"}
                    onChange={(e) =>
                      setSandboxType(e.target.value as "docker" | "cloudflare")
                    }
                    className="size-4 border-border accent-accent"
                  />
                  <span className="text-sm text-fg">Docker</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="cloudflare"
                    checked={sandboxType === "cloudflare"}
                    onChange={(e) =>
                      setSandboxType(e.target.value as "docker" | "cloudflare")
                    }
                    className="size-4 border-border accent-accent"
                  />
                  <span className="text-sm text-fg">Cloudflare</span>
                </label>
              </div>
            </div>

            {/* Image (Docker only) */}
            {sandboxType === "docker" && (
              <>
                <div>
                  <div className="mb-1.5 flex h-4 items-center gap-2">
                    <label
                      htmlFor="env-image"
                      className="text-xs font-medium leading-4 text-muted"
                    >
                      Docker Image
                    </label>
                    {probeStatus === "probing" && (
                      <span className="text-xs leading-4 text-muted">
                        Checking...
                      </span>
                    )}
                    {probeStatus === "available" && (
                      <span className="flex items-center gap-1 text-xs leading-4 text-green-500">
                        <CheckCircleIcon className="size-3" weight="fill" />
                        Available
                      </span>
                    )}
                    {probeStatus === "unavailable" && (
                      <span className="flex items-center gap-1 text-xs leading-4 text-red-500">
                        <WarningCircleIcon className="size-3" weight="fill" />
                        {probeError ?? "Not available"}
                      </span>
                    )}
                  </div>
                  <select
                    id="env-image"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                  >
                    {images.map((img) => (
                      <option key={img.id} value={img.image}>
                        {img.name}
                      </option>
                    ))}
                  </select>
                  {images.find((img) => img.image === image)?.description && (
                    <p className="mt-1 text-xs text-muted">
                      {images.find((img) => img.image === image)?.description}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="env-idle-timeout"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Idle Timeout
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="env-idle-timeout"
                      type="number"
                      min="1"
                      max="1440"
                      value={Math.round(idleTimeout / 60)}
                      onChange={(e) =>
                        setIdleTimeout(Number(e.target.value) * 60)
                      }
                      className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                    />
                    <span className="shrink-0 text-xs text-muted">minutes</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Suspend session after this period of inactivity.
                  </p>
                </div>
              </>
            )}

            {/* Worker URL (Cloudflare only) */}
            {sandboxType === "cloudflare" && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="env-worker-url"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Worker URL
                  </label>
                  <input
                    id="env-worker-url"
                    type="text"
                    value={workerUrl}
                    onChange={(e) => setWorkerUrl(e.target.value)}
                    placeholder="https://your-worker.example.com"
                    className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="env-secret-id"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    Shared Secret
                  </label>
                  {secrets.length === 0 ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
                      No secrets configured. Add one in Settings first.
                    </div>
                  ) : (
                    <select
                      id="env-secret-id"
                      value={secretId}
                      onChange={(e) => setSecretId(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
                      required
                    >
                      <option value="">Select a secret...</option>
                      {secrets.map((secret) => (
                        <option key={secret.id} value={secret.id}>
                          {secret.name} ({secret.envVar})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {probeStatus === "probing" && (
                  <p className="text-xs text-muted">Checking availability...</p>
                )}
                {probeStatus === "available" && (
                  <p className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircleIcon className="size-3" weight="fill" />
                    Available
                  </p>
                )}
                {probeStatus === "unavailable" && (
                  <p className="flex items-center gap-1 text-xs text-red-500">
                    <WarningCircleIcon className="size-3" weight="fill" />
                    {probeError ?? "Not available"}
                  </p>
                )}
              </div>
            )}

            {/* Default */}
            <label
              htmlFor="env-default"
              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface/30 px-3 py-2.5"
            >
              <input
                id="env-default"
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded border-border accent-accent"
              />
              <div>
                <span className="text-sm font-medium text-fg">
                  Set as default
                </span>
                <p className="text-xs text-muted">
                  Used when no environment is specified for new sessions.
                </p>
              </div>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !name.trim() ||
                  (sandboxType === "docker" && !image) ||
                  (sandboxType === "cloudflare" &&
                    (!workerUrl.trim() || !secretId)) ||
                  probeStatus !== "available"
                }
                loading={saving}
              >
                {isEdit ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog>
  );
}

// -- Environment Row --------------------------------------------------

function EnvironmentRow({
  environment,
  images,
  onEdit,
  onDelete,
}: {
  environment: Environment;
  images: AvailableImage[];
  onEdit: (env: Environment) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);

  useEffect(() => {
    const fetchSecrets = async () => {
      const res = await api.get<SecretInfo[]>("/secrets");
      if (res.data) {
        setSecrets(res.data);
      }
    };
    fetchSecrets();
  }, []);

  const imageMeta = images.find(
    (img) => img.image === environment.config.image,
  );

  const secretMeta = secrets.find((s) => s.id === environment.config.secretId);

  const handleDelete = async () => {
    if (!confirm(`Delete environment "${environment.name}"?`)) return;
    setDeleting(true);
    onDelete(environment.id);
  };

  const isCloudflare = environment.sandboxType === "cloudflare";

  const formatIdleTimeout = (seconds: number) => {
    const minutes = seconds / 60;
    const hours = seconds / 3600;
    if (seconds % 3600 === 0) {
      return `Idle: ${hours}h`;
    }
    return `Idle: ${minutes}m`;
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface/30 p-4">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          isCloudflare
            ? "bg-orange-500/10 text-orange-500"
            : "bg-accent/10 text-accent"
        }`}
      >
        {isCloudflare ? (
          <CloudIcon className="size-5" weight="duotone" />
        ) : (
          <CubeIcon className="size-5" weight="duotone" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{environment.name}</span>
          {environment.isDefault && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
              <StarIcon className="size-3" weight="fill" />
              Default
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {isCloudflare
            ? secretMeta
              ? `${environment.config.workerUrl} (Secret: ${secretMeta.name})`
              : environment.config.workerUrl
            : `${imageMeta?.name ?? environment.config.image}${
                environment.config.idleTimeoutSeconds
                  ? ` • ${formatIdleTimeout(environment.config.idleTimeoutSeconds)}`
                  : ""
              }`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onEdit(environment)}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
          title="Edit"
        >
          <PencilSimpleIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
          title="Delete"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

// -- Main Page --------------------------------------------------------

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [images, setImages] = useState<AvailableImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | undefined>();

  const loadData = useCallback(async () => {
    const [envsRes, imagesRes] = await Promise.all([
      api.get<Environment[]>("/environments"),
      api.get<AvailableImage[]>("/environments/images"),
    ]);

    if (envsRes.error) {
      setError(envsRes.error);
    } else if (envsRes.data) {
      setEnvironments(envsRes.data);
    }

    if (imagesRes.data) {
      setImages(imagesRes.data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (
    data: CreateEnvironmentRequest | UpdateEnvironmentRequest,
  ) => {
    const res = await api.post<Environment>("/environments", data);
    if (res.error) {
      alert(`Failed to create: ${res.error}`);
      return;
    }
    setDialogOpen(false);
    await loadData();
  };

  const handleUpdate = async (
    data: CreateEnvironmentRequest | UpdateEnvironmentRequest,
  ) => {
    if (!editingEnv) return;
    const res = await api.put<Environment>(
      `/environments/${editingEnv.id}`,
      data,
    );
    if (res.error) {
      alert(`Failed to update: ${res.error}`);
      return;
    }
    setEditingEnv(undefined);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    const res = await api.delete<{ ok: boolean }>(`/environments/${id}`);
    if (res.error) {
      alert(`Failed to delete: ${res.error}`);
      return;
    }
    await loadData();
  };

  const openCreate = () => {
    setEditingEnv(undefined);
    setDialogOpen(true);
  };

  const openEdit = (env: Environment) => {
    setEditingEnv(env);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEnv(undefined);
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" weight="bold" />
          New Environment
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted">Loading...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">
          {error}
        </div>
      ) : environments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <CubeIcon className="mx-auto mb-3 size-10 text-muted/50" />
          <p className="text-sm font-medium text-fg">No environments yet</p>
          <p className="mt-1 text-xs text-muted">
            Create an environment to configure sandbox settings for sessions.
          </p>
          <Button onClick={openCreate} className="mt-4">
            <PlusIcon className="size-4" weight="bold" />
            Create Environment
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {environments.map((env) => (
            <EnvironmentRow
              key={env.id}
              environment={env}
              images={images}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <EnvironmentDialog
        key={editingEnv?.id ?? "create"}
        environment={editingEnv}
        images={images}
        open={dialogOpen}
        onSave={editingEnv ? handleUpdate : handleCreate}
        onClose={closeDialog}
      />
    </div>
  );
}
