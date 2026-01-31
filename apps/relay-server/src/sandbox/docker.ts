import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, type Readable, type Writable } from "node:stream";
import Docker from "dockerode";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxStatus,
} from "./types";

export interface DockerProviderConfig {
  /** Docker image to use */
  image: string;

  /** Network mode (default: bridge) */
  networkMode?: string;

  /** Volume name prefix (default: pi-session) */
  volumePrefix?: string;

  /** Container name prefix (default: pi-sandbox) */
  containerPrefix?: string;

  /** Default resource limits */
  defaultResources?: {
    cpuShares?: number;
    memoryMB?: number;
  };

  /**
   * Secrets to inject into containers.
   * Keys are environment variable names (e.g., "ANTHROPIC_API_KEY"),
   * values are the secret values.
   * These are mounted as files in /run/secrets/ (not as env vars).
   */
  secrets?: Record<string, string>;

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
  volumePrefix: "pi-session",
  containerPrefix: "pi-sandbox",
  defaultResources: {
    cpuShares: 1024,
    memoryMB: 2048,
  },
} as const;

/**
 * Docker-based sandbox provider that runs pi inside isolated containers.
 */
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private docker: Docker;
  private config: Required<
    Pick<
      DockerProviderConfig,
      "image" | "networkMode" | "volumePrefix" | "containerPrefix"
    >
  > & {
    defaultResources: { cpuShares: number; memoryMB: number };
    secrets?: Record<string, string>;
    secretsBaseDir?: string;
  };
  private sandboxes = new Map<string, DockerSandboxHandle>();
  /** Track secrets directories for cleanup */
  private secretsDirs = new Map<string, string>();

  constructor(config: DockerProviderConfig = { image: DEFAULT_CONFIG.image }) {
    this.docker = new Docker();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      defaultResources: {
        ...DEFAULT_CONFIG.defaultResources,
        ...config.defaultResources,
      },
    };
  }

  /**
   * Update the secrets configuration.
   * Call this when secrets change in the database.
   */
  setSecrets(secrets: Record<string, string>): void {
    this.config.secrets = secrets;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const { sessionId, env = {}, repoUrl, repoBranch, resources } = options;

    // Check for existing sandbox
    const existing = this.sandboxes.get(sessionId);
    if (existing && existing.status !== "stopped") {
      return existing;
    }

    // Volume name for this session's workspace
    const volumeName = `${this.config.volumePrefix}-${sessionId}-workspace`;
    const containerName = `${this.config.containerPrefix}-${sessionId}`;

    // Create volume if it doesn't exist
    await this.ensureVolume(volumeName);

    // If repo URL provided, clone it into the volume
    if (repoUrl) {
      await this.cloneRepoIntoVolume(volumeName, repoUrl, repoBranch);
    }

    // Build environment variables (non-secret config only)
    const containerEnv = [
      ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
      `PI_SESSION_ID=${sessionId}`,
    ];

    // Create secrets directory on host and write secret files
    const secretsDir = this.createSecretsDir(sessionId);
    const binds = [`${volumeName}:/workspace`];

    if (secretsDir) {
      // Mount secrets directory as read-only
      binds.push(`${secretsDir}:/run/secrets:ro`);
      // Tell the container to source secrets from files
      containerEnv.push("PI_SECRETS_DIR=/run/secrets");
    }

    // Resource limits (with defaults guaranteed)
    const cpuShares =
      resources?.cpuShares ?? this.config.defaultResources.cpuShares ?? 1024;
    const memoryMB =
      resources?.memoryMB ?? this.config.defaultResources.memoryMB ?? 2048;

    const limits = {
      CpuShares: cpuShares,
      Memory: memoryMB * 1024 * 1024,
    };

    // Create container
    const container = await this.docker.createContainer({
      name: containerName,
      Image: this.config.image,
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
        CpuShares: limits.CpuShares,
        Memory: limits.Memory,
        AutoRemove: false, // We manage cleanup
      },
    });

    // Start container
    await container.start();

    // Attach to streams
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
    });

    // Demux stdout/stderr
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    container.modem.demuxStream(stream, stdout, stderr);

    // Create handle
    const handle = new DockerSandboxHandle(
      sessionId,
      container,
      stream,
      stdout,
      stderr,
      volumeName,
    );

    this.sandboxes.set(sessionId, handle);

    return handle;
  }

  getSandbox(sessionId: string): SandboxHandle | undefined {
    const handle = this.sandboxes.get(sessionId);
    if (handle && handle.status !== "stopped") {
      return handle;
    }
    return undefined;
  }

  removeSandbox(sessionId: string): void {
    const handle = this.sandboxes.get(sessionId);
    if (handle) {
      handle.terminate();
      this.sandboxes.delete(sessionId);
    }

    // Clean up secrets directory
    this.cleanupSecretsDir(sessionId);
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
        containerId: c.Id,
        status: this.dockerStateToStatus(c.State),
        createdAt: new Date(c.Created * 1000).toISOString(),
        volumeName: `${this.config.volumePrefix}-${sessionId}-workspace`,
      };
    });
  }

  async cleanup(): Promise<CleanupResult> {
    let containersRemoved = 0;
    const volumesRemoved = 0;

    // Remove stopped containers
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
      } catch {
        // Ignore errors
      }
    }

    // Note: We don't auto-remove volumes - they contain user data
    // Volume cleanup should be explicit via a separate method

    return { containersRemoved, volumesRemoved };
  }

  // --- Private helpers ---

  private async ensureVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).inspect();
    } catch {
      await this.docker.createVolume({ Name: name });
    }
  }

  private async cloneRepoIntoVolume(
    volumeName: string,
    repoUrl: string,
    branch?: string,
  ): Promise<void> {
    // Run a temporary container to clone the repo
    const branchArg = branch ? `--branch ${branch}` : "";
    const cmd = `git clone ${branchArg} ${repoUrl} /workspace`;

    const container = await this.docker.createContainer({
      Image: this.config.image,
      Cmd: ["bash", "-c", cmd],
      HostConfig: {
        Binds: [`${volumeName}:/workspace`],
        AutoRemove: true,
      },
    });

    await container.start();
    const result = await container.wait();

    if (result.StatusCode !== 0) {
      throw new Error(`Failed to clone repo: exit code ${result.StatusCode}`);
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
   * Create a temporary directory with secret files for a session.
   * Returns the directory path, or null if no secrets configured.
   */
  private createSecretsDir(sessionId: string): string | null {
    const secrets = this.config.secrets;
    if (!secrets || Object.keys(secrets).length === 0) {
      return null;
    }

    // Create a secure temporary directory
    // Use configured base dir or fall back to system tmpdir
    const baseDir = this.config.secretsBaseDir ?? tmpdir();
    const secretsDir = join(baseDir, `pi-secrets-${sessionId}`);
    mkdirSync(secretsDir, { mode: 0o700, recursive: true });

    // Write each secret as a file (lowercase name)
    for (const [envName, value] of Object.entries(secrets)) {
      const filename = envName.toLowerCase();
      const filepath = join(secretsDir, filename);
      writeFileSync(filepath, value, { mode: 0o400 });
    }

    this.secretsDirs.set(sessionId, secretsDir);
    return secretsDir;
  }

  /**
   * Clean up the secrets directory for a session.
   */
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
 */
class DockerSandboxHandle implements SandboxHandle {
  private _status: SandboxStatus = "running";
  private statusListeners = new Set<(status: SandboxStatus) => void>();

  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;

  constructor(
    readonly sessionId: string,
    private container: Docker.Container,
    stdinStream: NodeJS.WritableStream,
    stdoutStream: PassThrough,
    stderrStream: PassThrough,
    private _volumeName: string,
  ) {
    // Cast the streams to the correct types
    this.stdin = stdinStream as Writable;
    this.stdout = stdoutStream;
    this.stderr = stderrStream;

    // Monitor container state
    this.monitorContainer();
  }

  /** Get the volume name (for backup/restore operations) */
  get volumeName(): string {
    return this._volumeName;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  get containerId(): string {
    return this.container.id;
  }

  async terminate(): Promise<void> {
    try {
      await this.container.stop({ t: 10 }); // 10 second grace period
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

  async pause(): Promise<void> {
    await this.container.pause();
    this.setStatus("paused");
  }

  async resume(): Promise<void> {
    await this.container.unpause();
    this.setStatus("running");
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
