import {
  CubeIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import {
  type AvailableImage,
  api,
  type CreateEnvironmentRequest,
  type Environment,
  type UpdateEnvironmentRequest,
} from "../lib/api";

// -- Dialog Component -------------------------------------------------

function EnvironmentDialog({
  environment,
  images,
  onSave,
  onClose,
}: {
  environment?: Environment;
  images: AvailableImage[];
  onSave: (
    data: CreateEnvironmentRequest | UpdateEnvironmentRequest,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const isEdit = !!environment;
  const [name, setName] = useState(environment?.name ?? "");
  const [image, setImage] = useState(
    environment?.config.image ?? images[0]?.image ?? "",
  );
  const [isDefault, setIsDefault] = useState(environment?.isDefault ?? false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !image) return;

    setSaving(true);
    try {
      if (isEdit) {
        const update: UpdateEnvironmentRequest = {
          name: name.trim(),
          config: { image },
          isDefault,
        };
        await onSave(update);
      } else {
        const create: CreateEnvironmentRequest = {
          name: name.trim(),
          sandboxType: "docker",
          config: { image },
          isDefault,
        };
        await onSave(create);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-bg p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">
            {isEdit ? "Edit Environment" : "Create Environment"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:text-fg"
          >
            <XIcon className="size-4" />
          </button>
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

          {/* Image */}
          <div>
            <label
              htmlFor="env-image"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Docker Image
            </label>
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
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !image || saving}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const imageMeta = images.find(
    (img) => img.image === environment.config.image,
  );

  const handleDelete = async () => {
    if (!confirm(`Delete environment "${environment.name}"?`)) return;
    setDeleting(true);
    onDelete(environment.id);
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface/30 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <CubeIcon className="size-5" weight="duotone" />
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
          {imageMeta?.name ?? environment.config.image}
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
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-fg">Environments</h1>
          <p className="mt-1 text-sm text-muted">
            Sandbox configurations for code sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <PlusIcon className="size-4" weight="bold" />
          New Environment
        </button>
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
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" weight="bold" />
            Create Environment
          </button>
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
      {dialogOpen && (
        <EnvironmentDialog
          environment={editingEnv}
          images={images}
          onSave={editingEnv ? handleUpdate : handleCreate}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
