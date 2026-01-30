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
}

const DEFAULT_CONFIG: Required<DockerProviderConfig> = {
  image: "pi-sandbox:local",
  networkMode: "bridge",
  volumePrefix: "pi-session",
  containerPrefix: "pi-sandbox",
  defaultResources: {
    cpuShares: 1024,
    memoryMB: 2048,
  },
};

/**
 * Docker-based sandbox provider that runs pi inside isolated containers.
 */
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private docker: Docker;
  private config: Required<DockerProviderConfig>;
  private sandboxes = new Map<string, DockerSandboxHandle>();

  constructor(config: DockerProviderConfig = { image: DEFAULT_CONFIG.image }) {
    this.docker = new Docker();
    this.config = { ...DEFAULT_CONFIG, ...config };
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

    // Build environment variables
    const containerEnv = [
      ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
      `PI_SESSION_ID=${sessionId}`,
    ];

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
        Binds: [`${volumeName}:/workspace`],
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
