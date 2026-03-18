import {
  CheckCircleIcon,
  CloudIcon,
  CopyIcon,
  CubeIcon,
  DownloadSimpleIcon,
  FolderIcon,
  GitBranchIcon,
  HardDrivesIcon,
  InfoIcon,
  PencilSimpleIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dialog, Select } from "../components/ui";
import {
  type AvailableImage,
  api,
  type CreateEnvironmentRequest,
  type Environment,
  type EnvironmentConfig,
  type GondolinInstallResponse,
  type GondolinMetadata,
  type ProbeResult,
  type SandboxProviderStatus,
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

type EditableSandboxType = "docker" | "cloudflare" | "gondolin";
type WorkspaceMode = "github-clone" | "local-directory" | "git-worktree";

function formatIdleTimeout(seconds?: number): string | null {
  if (!seconds) return null;
  const minutes = seconds / 60;
  const hours = seconds / 3600;
  if (seconds % 3600 === 0) return `Idle: ${hours}h`;
  return `Idle: ${minutes}m`;
}

function formatWorkspaceMode(mode?: WorkspaceMode): string {
  switch (mode) {
    case "github-clone":
      return "GitHub clone";
    case "local-directory":
      return "Local directory";
    case "git-worktree":
      return "Git worktree";
    default:
      return "Local workspace";
  }
}

function buildLocalSummary(config: EnvironmentConfig): string {
  const mode = config.workspaceMode;
  if (mode === "github-clone") {
    return [
      formatWorkspaceMode(mode),
      config.repoUrl,
      config.repoBranch ? `Branch: ${config.repoBranch}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
  }

  if (mode === "git-worktree") {
    return [
      formatWorkspaceMode(mode),
      config.worktreeRepoPath,
      config.worktreeBranch ? `Branch: ${config.worktreeBranch}` : null,
      config.worktreePath ? `Path: ${config.worktreePath}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
  }

  return [formatWorkspaceMode(mode), config.localPath]
    .filter(Boolean)
    .join(" • ");
}

function buildProbeConfig(
  sandboxType: EditableSandboxType,
  values: {
    image: string;
    workerUrl: string;
    secretId: string;
    imagePath: string;
  },
) {
  if (sandboxType === "docker") return { image: values.image };
  if (sandboxType === "cloudflare") {
    return { workerUrl: values.workerUrl, secretId: values.secretId };
  }
  return {
    ...(values.imagePath.trim() ? { imagePath: values.imagePath.trim() } : {}),
  };
}

function getInitialSandboxType(environment?: Environment): EditableSandboxType {
  if (
    environment?.sandboxType === "docker" ||
    environment?.sandboxType === "cloudflare" ||
    environment?.sandboxType === "gondolin"
  ) {
    return environment.sandboxType;
  }
  return "docker";
}

function getInitialWorkspaceMode(environment?: Environment): WorkspaceMode {
  return environment?.config.workspaceMode ?? "local-directory";
}

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
  const isLocal = environment?.sandboxType === "local";
  const [name, setName] = useState(environment?.name ?? "");
  const [sandboxType, setSandboxType] = useState<EditableSandboxType>(
    getInitialSandboxType(environment),
  );
  const [image, setImage] = useState(
    environment?.config.image ?? images[0]?.image ?? "",
  );
  const [workerUrl, setWorkerUrl] = useState(
    environment?.config.workerUrl ?? "",
  );
  const [secretId, setSecretId] = useState(environment?.config.secretId ?? "");
  const [imagePath, setImagePath] = useState(
    environment?.config.imagePath ?? "",
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    getInitialWorkspaceMode(environment),
  );
  const [repoUrl, setRepoUrl] = useState(environment?.config.repoUrl ?? "");
  const [repoBranch, setRepoBranch] = useState(
    environment?.config.repoBranch ?? "",
  );
  const [localPath, setLocalPath] = useState(
    environment?.config.localPath ?? "",
  );
  const [worktreeRepoPath, setWorktreeRepoPath] = useState(
    environment?.config.worktreeRepoPath ?? "",
  );
  const [worktreePath, setWorktreePath] = useState(
    environment?.config.worktreePath ?? "",
  );
  const [worktreeBranch, setWorktreeBranch] = useState(
    environment?.config.worktreeBranch ?? "",
  );
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    environment?.config.envVars ?? [],
  );
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
  const dialogLayerRef = useRef<HTMLDivElement | null>(null);

  const [gondolinMetadata, setGondolinMetadata] =
    useState<GondolinMetadata | null>(null);
  const [gondolinLoading, setGondolinLoading] = useState(false);
  const [installingAssets, setInstallingAssets] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);

  const imageOptions = useMemo(
    () =>
      images.map((img) => ({
        value: img.image,
        label: img.name,
        description: img.description,
      })),
    [images],
  );

  const secretOptions = useMemo(
    () =>
      secrets.map((secret) => ({
        value: secret.id,
        label: secret.name,
        description: secret.envVar,
      })),
    [secrets],
  );

  const workspaceModeOptions = useMemo(
    () => [
      {
        value: "github-clone",
        label: "GitHub clone",
        description: "Clone a repository into a relay-managed workspace.",
      },
      {
        value: "local-directory",
        label: "Local directory",
        description: "Use an existing absolute path on the host machine.",
      },
      {
        value: "git-worktree",
        label: "Git worktree",
        description: "Create or reuse a worktree from an existing local repo.",
      },
    ],
    [],
  );

  useEffect(() => {
    const fetchSecrets = async () => {
      const res = await api.get<SecretInfo[]>("/secrets");
      if (res.data) setSecrets(res.data);
    };
    fetchSecrets();
  }, []);

  useEffect(() => {
    if (!open || sandboxType !== "gondolin" || isLocal) {
      setGondolinMetadata(null);
      return;
    }

    const fetchGondolinMetadata = async () => {
      setGondolinLoading(true);
      const query = imagePath.trim()
        ? `/environments/gondolin?imagePath=${encodeURIComponent(imagePath.trim())}`
        : "/environments/gondolin";
      const res = await api.get<GondolinMetadata>(query);
      if (res.data) setGondolinMetadata(res.data);
      setGondolinLoading(false);
    };

    fetchGondolinMetadata();
  }, [open, sandboxType, imagePath, isLocal]);

  useEffect(() => {
    if (isLocal) {
      setProbeStatus("available");
      setProbeError(null);
      return;
    }

    setProbeStatus(null);
    setProbeError(null);

    const isConfigComplete =
      (sandboxType === "docker" && !!image) ||
      (sandboxType === "cloudflare" && !!workerUrl.trim() && !!secretId) ||
      sandboxType === "gondolin";

    if (!isConfigComplete) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setProbeStatus("probing");
      const res = await api.post<ProbeResult>("/environments/probe", {
        sandboxType,
        config: buildProbeConfig(sandboxType, {
          image,
          workerUrl,
          secretId,
          imagePath,
        }),
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
  }, [isLocal, sandboxType, image, workerUrl, secretId, imagePath]);

  const handleCopyCommand = async () => {
    if (!gondolinMetadata?.installCommand) return;
    try {
      await navigator.clipboard.writeText(gondolinMetadata.installCommand);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch (err) {
      console.error("Failed to copy command:", err);
    }
  };

  const handleInstallAssets = async () => {
    setInstallingAssets(true);
    try {
      const res = await api.post<GondolinInstallResponse>(
        "/environments/gondolin/install",
        {
          destination:
            imagePath.trim() ||
            gondolinMetadata?.defaultInstallBaseDir ||
            undefined,
        },
      );
      if (res.error) {
        alert(`Failed to install assets: ${res.error}`);
      } else if (res.data?.ok) {
        const metaRes = await api.get<GondolinMetadata>(
          `/environments/gondolin?imagePath=${encodeURIComponent(res.data.destination)}`,
        );
        if (metaRes.data) setGondolinMetadata(metaRes.data);
        if (!imagePath && res.data.destination)
          setImagePath(res.data.destination);
      }
    } finally {
      setInstallingAssets(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!isLocal && sandboxType === "docker" && !image) return;
    if (
      !isLocal &&
      sandboxType === "cloudflare" &&
      (!workerUrl.trim() || !secretId)
    ) {
      return;
    }

    setSaving(true);
    try {
      const normalizedEnvVars = envVars.filter(
        (entry) => entry.key.trim() || entry.value,
      );
      const sharedConfig =
        normalizedEnvVars.length > 0 ? { envVars: normalizedEnvVars } : {};

      const config: EnvironmentConfig = isLocal
        ? {
            workspaceMode,
            idleTimeoutSeconds: idleTimeout,
            ...(workspaceMode === "github-clone"
              ? {
                  repoUrl: repoUrl.trim(),
                  ...(repoBranch.trim()
                    ? { repoBranch: repoBranch.trim() }
                    : {}),
                }
              : workspaceMode === "local-directory"
                ? { localPath: localPath.trim() }
                : {
                    worktreeRepoPath: worktreeRepoPath.trim(),
                    ...(worktreeBranch.trim()
                      ? { worktreeBranch: worktreeBranch.trim() }
                      : {}),
                    ...(worktreePath.trim()
                      ? { worktreePath: worktreePath.trim() }
                      : {}),
                  }),
            ...sharedConfig,
          }
        : sandboxType === "docker"
          ? { image, idleTimeoutSeconds: idleTimeout, ...sharedConfig }
          : sandboxType === "cloudflare"
            ? { workerUrl, secretId, ...sharedConfig }
            : {
                idleTimeoutSeconds: idleTimeout,
                ...(imagePath.trim() ? { imagePath: imagePath.trim() } : {}),
                ...sharedConfig,
              };

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

  const submitDisabled =
    !name.trim() ||
    (!isLocal &&
      ((sandboxType === "docker" && !image) ||
        (sandboxType === "cloudflare" && (!workerUrl.trim() || !secretId)) ||
        probeStatus !== "available"));

  return (
    <Dialog open={open} onOpenChange={(e) => !e.open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner ref={dialogLayerRef}>
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
                  disabled={isLocal}
                  className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  required
                />
                {isLocal && (
                  <p className="mt-1 text-xs text-muted">
                    The built-in local environment keeps its system-managed
                    name.
                  </p>
                )}
              </div>

              {isLocal ? (
                <div className="rounded-lg border border-border bg-surface/20 px-3 py-2.5 text-sm text-muted">
                  Sandbox Type: Local
                </div>
              ) : (
                <div>
                  <span className="mb-2.5 block text-xs font-medium text-muted">
                    Sandbox Type
                  </span>
                  <div className="flex gap-3">
                    {(["docker", "cloudflare", "gondolin"] as const).map(
                      (type) => (
                        <label key={type} className="flex items-center gap-2">
                          <input
                            type="radio"
                            value={type}
                            checked={sandboxType === type}
                            onChange={(e) =>
                              setSandboxType(
                                e.target.value as EditableSandboxType,
                              )
                            }
                            className="size-4 border-border accent-accent"
                          />
                          <span className="text-sm text-fg">
                            {type === "docker"
                              ? "Docker"
                              : type === "cloudflare"
                                ? "Cloudflare"
                                : "Gondolin"}
                          </span>
                        </label>
                      ),
                    )}
                  </div>
                </div>
              )}

              {isLocal ? (
                <div className="space-y-4">
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      Workspace Mode
                    </span>
                    <Select
                      value={workspaceMode}
                      onValueChange={(value) =>
                        setWorkspaceMode(value as WorkspaceMode)
                      }
                      portalContainer={dialogLayerRef}
                      items={workspaceModeOptions}
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

                  {workspaceMode === "github-clone" && (
                    <>
                      <div>
                        <label
                          htmlFor="env-local-repo-url"
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Repository URL
                        </label>
                        <input
                          id="env-local-repo-url"
                          type="text"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          placeholder="https://github.com/owner/repo.git"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="env-local-repo-branch"
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Branch (optional)
                        </label>
                        <input
                          id="env-local-repo-branch"
                          type="text"
                          value={repoBranch}
                          onChange={(e) => setRepoBranch(e.target.value)}
                          placeholder="main"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  {workspaceMode === "local-directory" && (
                    <div>
                      <label
                        htmlFor="env-local-path"
                        className="mb-1.5 block text-xs font-medium text-muted"
                      >
                        Local Directory Path
                      </label>
                      <input
                        id="env-local-path"
                        type="text"
                        value={localPath}
                        onChange={(e) => setLocalPath(e.target.value)}
                        placeholder="/absolute/path/to/project"
                        className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        required
                      />
                    </div>
                  )}

                  {workspaceMode === "git-worktree" && (
                    <>
                      <div>
                        <label
                          htmlFor="env-worktree-repo-path"
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Repository Path
                        </label>
                        <input
                          id="env-worktree-repo-path"
                          type="text"
                          value={worktreeRepoPath}
                          onChange={(e) => setWorktreeRepoPath(e.target.value)}
                          placeholder="/absolute/path/to/repo"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="env-worktree-branch"
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Worktree Branch (optional)
                        </label>
                        <input
                          id="env-worktree-branch"
                          type="text"
                          value={worktreeBranch}
                          onChange={(e) => setWorktreeBranch(e.target.value)}
                          placeholder="feature/pi-session"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="env-worktree-path"
                          className="mb-1.5 block text-xs font-medium text-muted"
                        >
                          Worktree Path (optional)
                        </label>
                        <input
                          id="env-worktree-path"
                          type="text"
                          value={worktreePath}
                          onChange={(e) => setWorktreePath(e.target.value)}
                          placeholder="/absolute/path/to/worktree"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <label
                      htmlFor="env-idle-timeout-local"
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Idle Timeout
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="env-idle-timeout-local"
                        type="number"
                        min="1"
                        max="1440"
                        value={Math.round(idleTimeout / 60)}
                        onChange={(e) =>
                          setIdleTimeout(Number(e.target.value) * 60)
                        }
                        className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                      />
                      <span className="shrink-0 text-xs text-muted">
                        minutes
                      </span>
                    </div>
                  </div>
                </div>
              ) : sandboxType === "docker" ? (
                <>
                  <div>
                    <div className="mb-1.5 flex h-4 items-center gap-2">
                      <span className="text-xs font-medium leading-4 text-muted">
                        Docker Image
                      </span>
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
                    <Select
                      value={image}
                      onValueChange={setImage}
                      portalContainer={dialogLayerRef}
                      items={imageOptions}
                      renderItem={(item) => (
                        <div>
                          <p className="truncate">{item.label}</p>
                          {item.description && (
                            <p className="truncate text-xs text-muted">
                              {item.description}
                            </p>
                          )}
                        </div>
                      )}
                    />
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
                      <span className="shrink-0 text-xs text-muted">
                        minutes
                      </span>
                    </div>
                  </div>
                </>
              ) : sandboxType === "gondolin" ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <InfoIcon className="mt-0.5 size-4 shrink-0 text-violet-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-violet-500">
                          Guest assets required
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Gondolin requires guest VM assets downloaded on the
                          relay host.
                        </p>
                      </div>
                    </div>
                  </div>

                  {!gondolinLoading && gondolinMetadata && (
                    <div className="rounded-lg border border-border bg-surface/30 p-3">
                      <div className="flex items-center gap-2">
                        {gondolinMetadata.assetsExist ? (
                          <CheckCircleIcon
                            className="size-4 text-green-500"
                            weight="fill"
                          />
                        ) : (
                          <WarningCircleIcon
                            className="size-4 text-amber-500"
                            weight="fill"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-fg">
                            {gondolinMetadata.assetsExist
                              ? "Assets installed"
                              : "Assets not found"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {gondolinMetadata.checkedPath}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {gondolinMetadata && !gondolinMetadata.assetsExist && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted">
                          Install command
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyCommand}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-fg"
                        >
                          <CopyIcon className="size-3" />
                          {copiedCommand ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded-lg border border-border bg-surface/50 p-2.5 text-xs text-muted">
                        <code>{gondolinMetadata.installCommand}</code>
                      </pre>
                    </div>
                  )}

                  {gondolinMetadata && !gondolinMetadata.assetsExist && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleInstallAssets}
                      loading={installingAssets}
                      disabled={installingAssets}
                      className="w-full"
                    >
                      <DownloadSimpleIcon className="size-4" weight="bold" />
                      Install Assets Now
                    </Button>
                  )}

                  <div>
                    <label
                      htmlFor="env-gondolin-image-path"
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Guest Assets Path (optional)
                    </label>
                    <input
                      id="env-gondolin-image-path"
                      type="text"
                      value={imagePath}
                      onChange={(e) => setImagePath(e.target.value)}
                      placeholder={
                        gondolinMetadata?.defaultInstallBaseDir ||
                        "/absolute/path/to/gondolin/assets"
                      }
                      className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="env-idle-timeout-gondolin"
                      className="mb-1.5 block text-xs font-medium text-muted"
                    >
                      Idle Timeout
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="env-idle-timeout-gondolin"
                        type="number"
                        min="1"
                        max="1440"
                        value={Math.round(idleTimeout / 60)}
                        onChange={(e) =>
                          setIdleTimeout(Number(e.target.value) * 60)
                        }
                        className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                      />
                      <span className="shrink-0 text-xs text-muted">
                        minutes
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
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
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      Shared Secret
                    </span>
                    {secrets.length === 0 ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
                        No secrets configured. Add one in Settings first.
                      </div>
                    ) : (
                      <Select
                        value={secretId}
                        onValueChange={setSecretId}
                        portalContainer={dialogLayerRef}
                        placeholder="Select a secret..."
                        items={secretOptions}
                        renderItem={(item) => (
                          <div>
                            <p className="truncate">{item.label}</p>
                            <p className="truncate text-xs text-muted">
                              {item.description}
                            </p>
                          </div>
                        )}
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">
                    Environment Variables
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEnvVars((current) => [
                        ...current,
                        { key: "", value: "" },
                      ])
                    }
                    className="text-xs text-accent hover:underline"
                  >
                    Add variable
                  </button>
                </div>
                {envVars.length === 0 ? (
                  <p className="text-xs text-muted">
                    Plain env vars shared with the sandbox. Values are visible
                    here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {envVars.map((entry, index) => (
                      <div
                        key={`${index}-${entry.key}`}
                        className="grid grid-cols-[1fr_1fr_auto] gap-2"
                      >
                        <input
                          type="text"
                          value={entry.key}
                          onChange={(e) =>
                            setEnvVars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      key: e.target.value.toUpperCase(),
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="FOO_BAR"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        />
                        <input
                          type="text"
                          value={entry.value}
                          onChange={(e) =>
                            setEnvVars((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, value: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="value"
                          className="w-full rounded-lg border border-border bg-surface/30 px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEnvVars((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:bg-surface hover:text-fg"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted">
                  Keys must be uppercase and match shell-safe env var names.
                </p>
              </div>

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

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitDisabled}
                  loading={saving}
                >
                  {isEdit ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Portal>
    </Dialog>
  );
}

function EnvironmentRow({
  environment,
  images,
  providerStatus,
  onEdit,
  onDelete,
  onRecheckLocal,
}: {
  environment: Environment;
  images: AvailableImage[];
  providerStatus: SandboxProviderStatus | null;
  onEdit: (env: Environment) => void;
  onDelete: (id: string) => Promise<void>;
  onRecheckLocal: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [recheckingLocal, setRecheckingLocal] = useState(false);
  const [secrets, setSecrets] = useState<SecretInfo[]>([]);

  useEffect(() => {
    const fetchSecrets = async () => {
      const res = await api.get<SecretInfo[]>("/secrets");
      if (res.data) setSecrets(res.data);
    };
    fetchSecrets();
  }, []);

  const imageMeta = images.find(
    (img) => img.image === environment.config.image,
  );
  const secretMeta = secrets.find((s) => s.id === environment.config.secretId);
  const isCloudflare = environment.sandboxType === "cloudflare";
  const isGondolin = environment.sandboxType === "gondolin";
  const isLocal = environment.sandboxType === "local";
  const localStatus = providerStatus?.local;
  const localAvailable = isLocal ? (localStatus?.available ?? false) : true;

  const handleDelete = async () => {
    if (!confirm(`Delete environment "${environment.name}"?`)) return;
    setDeleting(true);
    try {
      await onDelete(environment.id);
    } finally {
      setDeleting(false);
    }
  };

  const handleRecheck = async () => {
    setRecheckingLocal(true);
    try {
      await onRecheckLocal();
    } finally {
      setRecheckingLocal(false);
    }
  };

  const summary = isLocal
    ? buildLocalSummary(environment.config)
    : isCloudflare
      ? secretMeta
        ? `${environment.config.workerUrl} (Secret: ${secretMeta.name})`
        : (environment.config.workerUrl ?? "Cloudflare worker")
      : isGondolin
        ? `Gondolin${environment.config.imagePath ? ` (${environment.config.imagePath})` : ""}${formatIdleTimeout(environment.config.idleTimeoutSeconds) ? ` • ${formatIdleTimeout(environment.config.idleTimeoutSeconds)}` : ""}`
        : `${imageMeta?.name ?? environment.config.image ?? "Docker"}${formatIdleTimeout(environment.config.idleTimeoutSeconds) ? ` • ${formatIdleTimeout(environment.config.idleTimeoutSeconds)}` : ""}`;

  const iconClasses = isLocal
    ? localAvailable
      ? "bg-emerald-500/10 text-emerald-500"
      : "bg-amber-500/10 text-amber-500"
    : isCloudflare
      ? "bg-orange-500/10 text-orange-500"
      : isGondolin
        ? "bg-violet-500/10 text-violet-500"
        : "bg-accent/10 text-accent";

  return (
    <div
      className={`rounded-lg border border-border bg-surface/30 p-4 transition-opacity ${
        isLocal && !localAvailable ? "opacity-65" : "opacity-100"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconClasses}`}
        >
          {isLocal ? (
            <HardDrivesIcon className="size-5" weight="duotone" />
          ) : isCloudflare ? (
            <CloudIcon className="size-5" weight="duotone" />
          ) : (
            <CubeIcon className="size-5" weight="duotone" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-fg">{environment.name}</span>
            {environment.isDefault && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-500">
                <StarIcon className="size-3" weight="fill" />
                Default
              </span>
            )}
            {isLocal && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  localAvailable
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-amber-500/10 text-amber-500"
                }`}
              >
                {localAvailable ? "Local available" : "Local unavailable"}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs text-muted">{summary}</p>

          {isLocal && (
            <div className="mt-3 space-y-1.5 text-xs text-muted">
              {environment.config.workspaceMode === "local-directory" &&
                environment.config.localPath && (
                  <p className="flex items-center gap-1.5">
                    <FolderIcon className="size-3.5" />
                    {environment.config.localPath}
                  </p>
                )}
              {environment.config.workspaceMode === "github-clone" &&
                environment.config.repoUrl && (
                  <p className="flex items-center gap-1.5">
                    <GitBranchIcon className="size-3.5" />
                    {environment.config.repoUrl}
                    {environment.config.repoBranch
                      ? ` • ${environment.config.repoBranch}`
                      : ""}
                  </p>
                )}
              {environment.config.workspaceMode === "git-worktree" && (
                <>
                  {environment.config.worktreeRepoPath && (
                    <p className="flex items-center gap-1.5">
                      <FolderIcon className="size-3.5" />
                      Repo: {environment.config.worktreeRepoPath}
                    </p>
                  )}
                  {(environment.config.worktreeBranch ||
                    environment.config.worktreePath) && (
                    <p className="flex items-center gap-1.5">
                      <GitBranchIcon className="size-3.5" />
                      {environment.config.worktreeBranch
                        ? `Branch: ${environment.config.worktreeBranch}`
                        : "Worktree"}
                      {environment.config.worktreePath
                        ? ` • ${environment.config.worktreePath}`
                        : ""}
                    </p>
                  )}
                </>
              )}
              {localStatus?.path && <p>pi: {localStatus.path}</p>}
              {localStatus?.version && <p>Version: {localStatus.version}</p>}
              {!localAvailable && localStatus?.error && (
                <p className="flex items-start gap-1.5 text-amber-500">
                  <WarningCircleIcon
                    className="mt-0.5 size-3.5 shrink-0"
                    weight="fill"
                  />
                  <span>{localStatus.error}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isLocal && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleRecheck}
              loading={recheckingLocal}
              disabled={recheckingLocal}
              className="px-3 py-1.5 text-xs"
            >
              Check again
            </Button>
          )}
          <button
            type="button"
            onClick={() => onEdit(environment)}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
            title="Edit"
          >
            <PencilSimpleIcon className="size-4" />
          </button>
          {!isLocal && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
              title="Delete"
            >
              <TrashIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [images, setImages] = useState<AvailableImage[]>([]);
  const [providerStatus, setProviderStatus] =
    useState<SandboxProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | undefined>();
  const [createDialogVersion, setCreateDialogVersion] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [envsRes, imagesRes, providerRes] = await Promise.all([
      api.get<Environment[]>("/environments"),
      api.get<AvailableImage[]>("/environments/images"),
      api.get<SandboxProviderStatus>("/settings/sandbox-providers"),
    ]);

    if (envsRes.error) {
      setError(envsRes.error);
    } else if (envsRes.data) {
      setError(null);
      setEnvironments(envsRes.data);
    }

    if (imagesRes.data) setImages(imagesRes.data);
    if (providerRes.data) setProviderStatus(providerRes.data);
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
    setEditingEnv(undefined);
    setCreateDialogVersion((v) => v + 1);
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
    setDialogOpen(false);
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

  const handleRecheckLocal = async () => {
    const res = await api.post<SandboxProviderStatus["local"]>(
      "/settings/sandbox-providers/local/recheck",
      {},
    );
    if (res.error) {
      alert(`Failed to re-check local provider: ${res.error}`);
      return;
    }
    if (res.data) {
      setProviderStatus((current) =>
        current
          ? { ...current, local: res.data }
          : {
              docker: { available: false },
              gondolin: { available: false },
              local: res.data,
            },
      );
    }
    await loadData();
  };

  const openCreate = () => {
    setEditingEnv(undefined);
    setCreateDialogVersion((v) => v + 1);
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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            <CubeIcon className="size-5" weight="bold" />
            Environments
          </h2>
          <p className="mt-1 text-sm text-muted">
            Configure sandbox environments used by new code sessions.
          </p>
        </div>
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
              providerStatus={providerStatus}
              onEdit={openEdit}
              onDelete={handleDelete}
              onRecheckLocal={handleRecheckLocal}
            />
          ))}
        </div>
      )}

      <EnvironmentDialog
        key={editingEnv?.id ?? `create-${createDialogVersion}`}
        environment={editingEnv}
        images={images}
        open={dialogOpen}
        onSave={editingEnv ? handleUpdate : handleCreate}
        onClose={closeDialog}
      />
    </div>
  );
}
