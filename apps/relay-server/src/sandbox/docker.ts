import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { type Duplex, PassThrough } from "node:stream";
import Docker from "dockerode";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxStatus,
  SandboxStreams,
} from "./types";

/**
 * Get the host process UID:GID string for container User field.
 * Containers run as the host user so bind-mounted dirs are writable.
 * fixuid (in the image entrypoint) remaps the container's "user"
 * to match this UID/GID.
 */
function getHostUser(): string {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) {
    throw new Error(
      "Docker sandbox requires a POSIX host (process.getuid/getgid unavailable)",
    );
  }
  return `${uid}:${gid}`;
}

export interface DockerProviderConfig {
  /** Docker image to use */
  image: string;

  /** Network mode (default: bridge) */
  networkMode?: string;

  /** Container name prefix (default: pi-sandbox) */
  containerPrefix?: string;

  /** Docker socket path (default: /var/run/docker.sock, or DOCKER_HOST env) */
  socketPath?: string;

  /** Default resource limits */
  defaultResources?: {
    cpuShares?: number;
    memoryMB?: number;
  };

  /**
   * Base directory for per-session data on the host.
   * Each session gets a subdirectory with workspace/ and agent/ dirs.
   * Must be accessible to Docker (not /tmp on Lima/Docker Desktop).
   */
  sessionDataDir: string;

  /**
   * Base directory for temporary secrets files.
   * Must be accessible to Docker (not /tmp on Lima/Docker Desktop).
   * Defaults to os.tmpdir() - override for Lima compatibility.
   */
  secretsBaseDir?: string;
}

const DEFAULT_CONFIG = {
  image: "pi-sandbox:local",
  networkMode: "bridge",
  containerPrefix: "pi-sandbox",
  defaultResources: {
    cpuShares: 1024,
    memoryMB: 2048,
  },
} as const;

/**
 * Docker-based sandbox provider that runs pi inside isolated containers.
 *
 * Per-session directory structure on the host:
 *   <sessionDataDir>/<sessionId>/workspace/  -> /workspace (container)
 *   <sessionDataDir>/<sessionId>/agent/      -> /data/agent (container)
 */
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private docker: Docker;
  private config: Required<
    Pick<DockerProviderConfig, "image" | "networkMode" | "containerPrefix">
  > & {
    defaultResources: { cpuShares: number; memoryMB: number };
    sessionDataDir: string;
    secretsBaseDir?: string;
  };
  /** Optional cache of handles — Docker is always the source of truth. */
  private handleCache = new Map<string, DockerSandboxHandle>();
  /** Track secrets directories for cleanup */
  private secretsDirs = new Map<string, string>();

  constructor(config: DockerProviderConfig) {
    const socketPath = config.socketPath ?? this.resolveDockerSocket();
    this.docker = new Docker({ socketPath });
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      defaultResources: {
        ...DEFAULT_CONFIG.defaultResources,
        ...config.defaultResources,
      },
    };
  }

  /** Resolve Docker socket from DOCKER_HOST env or default path. */
  private resolveDockerSocket(): string {
    const dockerHost = process.env.DOCKER_HOST;
    if (dockerHost) {
      // DOCKER_HOST can be unix:///path/to/sock or just /path/to/sock
      return dockerHost.replace(/^unix:\/\//, "");
    }
    return "/var/run/docker.sock";
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the host path for a session's data directory.
   */
  getSessionDataPath(sessionId: string): string {
    return join(this.config.sessionDataDir, sessionId);
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const {
      sessionId,
      env = {},
      secrets,
      repoUrl,
      repoBranch,
      resources,
    } = options;

    // Check cache for existing running handle
    const cached = this.handleCache.get(sessionId);
    if (cached && cached.status !== "stopped" && cached.status !== "error") {
      return cached;
    }

    const containerName = `${this.config.containerPrefix}-${sessionId}`;

    // Create per-session host directories
    const sessionDir = this.getSessionDataPath(sessionId);
    const workspaceDir = join(sessionDir, "workspace");
    const agentDir = join(sessionDir, "agent");

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    // If repo URL provided, clone it into the workspace dir
    if (repoUrl) {
      await this.cloneRepoIntoDir(workspaceDir, repoUrl, repoBranch);
    }

    // Build environment variables (non-secret config only)
    const containerEnv = [
      ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
      `PI_SESSION_ID=${sessionId}`,
    ];

    // Create secrets directory on host and write secret files
    const secretsDir = this.writeSecretsDir(sessionId, secrets);
    const binds = [`${workspaceDir}:/workspace`, `${agentDir}:/data/agent`];

    if (secretsDir) {
      binds.push(`${secretsDir}:/run/secrets:ro`);
      containerEnv.push("PI_SECRETS_DIR=/run/secrets");
    }

    // Resource limits
    const cpuShares =
      resources?.cpuShares ?? this.config.defaultResources.cpuShares ?? 1024;
    const memoryMB =
      resources?.memoryMB ?? this.config.defaultResources.memoryMB ?? 2048;

    const hostUser = getHostUser();

    // Create container
    const container = await this.docker.createContainer({
      name: containerName,
      Image: this.config.image,
      User: hostUser,
      Env: containerEnv,
      WorkingDir: "/workspace",
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: false,
      Tty: false,
      HostConfig: {
        Binds: binds,
        NetworkMode: this.config.networkMode,
        CpuShares: cpuShares,
        Memory: memoryMB * 1024 * 1024,
        AutoRemove: false,
      },
    });

    // Start container
    await container.start();

    // Capture image digest for reproducibility
    const imageInfo = await this.docker.getImage(this.config.image).inspect();
    const imageDigest = imageInfo.Id;

    const handle = new DockerSandboxHandle(
      sessionId,
      container,
      imageDigest,
      (sid, s) => this.writeSecretsDir(sid, s),
    );

    this.handleCache.set(sessionId, handle);

    return handle;
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    // Check cache first
    for (const [, handle] of this.handleCache) {
      if (
        handle.providerId === providerId &&
        handle.status !== "stopped" &&
        handle.status !== "error"
      ) {
        return handle;
      }
    }

    // Not in cache — inspect Docker directly
    const container = this.docker.getContainer(providerId);
    let info: Docker.ContainerInspectInfo;
    try {
      info = await container.inspect();
    } catch {
      throw new Error(
        `Sandbox not found: container ${providerId} does not exist`,
      );
    }

    // Extract session ID from container name
    const name = info.Name.replace(/^\//, "");
    const prefix = `${this.config.containerPrefix}-`;
    if (!name.startsWith(prefix)) {
      throw new Error(`Container ${providerId} is not a sandbox container`);
    }
    const sessionId = name.slice(prefix.length);

    // Build handle from inspected state
    const status = this.dockerStateToStatus(info.State.Status);
    const imageDigest = info.Image;

    const handle = new DockerSandboxHandle(
      sessionId,
      container,
      imageDigest,
      (sid, s) => this.writeSecretsDir(sid, s),
    );
    handle.setInitialStatus(status);

    this.handleCache.set(sessionId, handle);

    return handle;
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        name: [`${this.config.containerPrefix}-`],
      },
    });

    return containers.map((c) => {
      const sessionId =
        c.Names[0]?.replace(`/${this.config.containerPrefix}-`, "") ?? "";
      return {
        sessionId,
        providerId: c.Id,
        status: this.dockerStateToStatus(c.State),
        createdAt: new Date(c.Created * 1000).toISOString(),
      };
    });
  }

  async cleanup(): Promise<CleanupResult> {
    let containersRemoved = 0;
    const volumesRemoved = 0;

    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        name: [`${this.config.containerPrefix}-`],
        status: ["exited", "dead"],
      },
    });

    for (const c of containers) {
      try {
        const container = this.docker.getContainer(c.Id);
        await container.remove({ force: true });
        containersRemoved++;

        // Clean up cached handle
        const sessionId =
          c.Names[0]?.replace(`/${this.config.containerPrefix}-`, "") ?? "";
        this.handleCache.delete(sessionId);
        this.cleanupSecretsDir(sessionId);
      } catch {
        // Ignore errors
      }
    }

    return { containersRemoved, volumesRemoved };
  }

  // --- Private helpers ---

  private async cloneRepoIntoDir(
    workspaceDir: string,
    repoUrl: string,
    branch?: string,
  ): Promise<void> {
    const branchArg = branch ? `--branch ${branch}` : "";
    const cmd = `git clone ${branchArg} ${repoUrl} /workspace`;

    const hostUser = getHostUser();

    const container = await this.docker.createContainer({
      Image: this.config.image,
      Cmd: ["bash", "-c", cmd],
      User: hostUser,
      HostConfig: {
        Binds: [`${workspaceDir}:/workspace`],
        NetworkMode: this.config.networkMode,
      },
    });

    await container.start();
    const result = await container.wait();

    if (result.StatusCode !== 0) {
      // Capture logs before removing the container
      let output = "";
      try {
        const logs = await container.logs({ stdout: true, stderr: true });
        output = logs.toString().trim();
      } catch {
        // Best-effort log capture
      }
      try {
        await container.remove();
      } catch {
        // Container may already be gone
      }
      const detail = output ? `\n${output}` : "";
      throw new Error(
        `Failed to clone repo: exit code ${result.StatusCode}${detail}`,
      );
    }

    // Clean up on success
    try {
      await container.remove();
    } catch {
      // Container may already be gone
    }
  }

  private dockerStateToStatus(state: string): SandboxStatus {
    switch (state) {
      case "created":
        return "creating";
      case "running":
        return "running";
      case "paused":
        return "paused";
      case "restarting":
        return "creating";
      case "removing":
      case "exited":
      case "dead":
        return "stopped";
      default:
        return "error";
    }
  }

  /**
   * Write secrets as files to a host directory for bind mounting.
   * Called at creation and on resume (to pick up changes).
   * Returns the directory path, or null if no secrets.
   */
  writeSecretsDir(
    sessionId: string,
    secrets?: Record<string, string>,
  ): string | null {
    if (!secrets || Object.keys(secrets).length === 0) {
      return this.secretsDirs.get(sessionId) ?? null;
    }

    const baseDir = this.config.secretsBaseDir ?? tmpdir();
    const secretsDir = join(baseDir, `pi-secrets-${sessionId}`);
    mkdirSync(secretsDir, { mode: 0o700, recursive: true });

    for (const [envName, value] of Object.entries(secrets)) {
      const filename = envName.toLowerCase();
      const filepath = join(secretsDir, filename);
      // chmod 0o600 first to allow overwrite on resume, then lock to 0o400
      try {
        chmodSync(filepath, 0o600);
      } catch {
        // File may not exist yet
      }
      writeFileSync(filepath, value, { mode: 0o400 });
    }

    this.secretsDirs.set(sessionId, secretsDir);
    return secretsDir;
  }

  private cleanupSecretsDir(sessionId: string): void {
    const secretsDir = this.secretsDirs.get(sessionId);
    if (secretsDir) {
      try {
        rmSync(secretsDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      this.secretsDirs.delete(sessionId);
    }
  }
}

/**
 * Handle for a Docker-based sandbox.
 * Does not hold streams — call attach() to get them.
 */
class DockerSandboxHandle implements SandboxHandle {
  private _status: SandboxStatus = "running";
  private statusListeners = new Set<(status: SandboxStatus) => void>();
  private currentStreams: DockerSandboxStreams | null = null;

  constructor(
    readonly sessionId: string,
    private container: Docker.Container,
    private _imageDigest: string,
    private writeSecrets?: (
      sessionId: string,
      secrets?: Record<string, string>,
    ) => string | null,
  ) {}

  get providerId(): string {
    return this.container.id;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  get imageDigest(): string {
    return this._imageDigest;
  }

  /** Used by provider when reconstructing handle from Docker inspect. */
  setInitialStatus(status: SandboxStatus): void {
    this._status = status;
  }

  async resume(secrets?: Record<string, string>): Promise<void> {
    // Refresh secrets on host before resuming (bind mount picks them up)
    if (secrets && this.writeSecrets) {
      this.writeSecrets(this.sessionId, secrets);
    }

    // Handle state transitions to get to running state
    if (this._status === "paused") {
      await this.container.unpause();
      this.setStatus("running");
    } else if (this._status === "stopped") {
      await this.container.start();
      this.setStatus("running");
    } else if (this._status === "creating") {
      // Wait briefly for container to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      const info = await this.container.inspect();
      if (info.State.Running) {
        this.setStatus("running");
      }
    } else if (this._status === "running") {
      // Already running, no-op
      return;
    } else if (this._status === "error") {
      throw new Error(
        `Cannot resume: container ${this.container.id} is in error state`,
      );
    }

    // Final verification that container is running
    const info = await this.container.inspect();
    if (!info.State.Running) {
      throw new Error(
        `Cannot resume: container ${this.container.id} is not running (state: ${info.State.Status})`,
      );
    }
  }

  async attach(): Promise<SandboxStreams> {
    // If already attached, detach old streams first
    if (this.currentStreams) {
      this.currentStreams.detach();
      this.currentStreams = null;
    }

    // Verify container is running (assume resume() was called)
    const info = await this.container.inspect();
    if (!info.State.Running) {
      throw new Error(
        `Cannot attach: container ${this.container.id} is not running (state: ${info.State.Status})`,
      );
    }

    const stream = await this.container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    });

    // Cast to Duplex
    const raw = stream as unknown as Duplex;

    // Demux stdout/stderr
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    this.container.modem.demuxStream(raw, stdout, stderr);

    // Add no-op error handlers to prevent crashes on late writes
    raw.on("error", () => {});
    stdout.on("error", () => {});
    stderr.on("error", () => {});

    const streams = new DockerSandboxStreams(raw, stdout, stderr);
    this.currentStreams = streams;

    // Monitor container for unexpected exits
    this.monitorContainer();

    return streams;
  }

  async pause(): Promise<void> {
    // Detach streams before pausing
    if (this.currentStreams) {
      this.currentStreams.detach();
      this.currentStreams = null;
    }

    await this.container.pause();
    this.setStatus("paused");
  }

  async terminate(): Promise<void> {
    // Detach streams
    if (this.currentStreams) {
      this.currentStreams.detach();
      this.currentStreams = null;
    }

    try {
      await this.container.stop({ t: 10 });
    } catch {
      // Container may already be stopped
    }
    try {
      await this.container.remove({ force: true });
    } catch {
      // Ignore
    }
    this.setStatus("stopped");
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private setStatus(status: SandboxStatus): void {
    if (this._status !== status) {
      this._status = status;
      for (const listener of this.statusListeners) {
        listener(status);
      }
    }
  }

  private async monitorContainer(): Promise<void> {
    try {
      await this.container.wait();
      this.setStatus("stopped");
    } catch {
      this.setStatus("error");
    }
  }
}

/**
 * Live streams to a Docker container.
 */
class DockerSandboxStreams implements SandboxStreams {
  private detached = false;
  private raw: Duplex;

  constructor(
    raw: Duplex,
    readonly stdout: PassThrough,
    readonly stderr: PassThrough,
  ) {
    this.raw = raw;
  }

  get stdin(): Duplex {
    return this.raw;
  }

  detach(): void {
    if (this.detached) return;
    this.detached = true;

    // Destroy the raw stream first to stop demux input
    this.raw.destroy();
    this.raw.removeAllListeners();

    // Then destroy stdout/stderr
    this.stdout.destroy();
    this.stderr.destroy();
  }
}
