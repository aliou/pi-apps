import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import readline from "node:readline";
import { type Duplex, PassThrough } from "node:stream";
import Docker from "dockerode";
import { createLogger } from "../lib/logger";
import { writeGitConfig } from "./git-config";
import type { SandboxLogStore } from "./log-store";
import type { SandboxResourceTier } from "./provider-types";
import type {
  CleanupResult,
  CreateSandboxOptions,
  PtyHandle,
  SandboxChannel,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxProviderCapabilities,
  SandboxStatus,
} from "./types";

const log = createLogger("docker");

/** Docker resource limits per tier. */
const RESOURCE_TIER_LIMITS: Record<
  SandboxResourceTier,
  { cpuShares: number; memoryMB: number }
> = {
  small: { cpuShares: 512, memoryMB: 1024 },
  medium: { cpuShares: 1024, memoryMB: 2048 },
  large: { cpuShares: 2048, memoryMB: 4096 },
};

const DEFAULT_TIER: SandboxResourceTier = "medium";

/** Host path to the native bridge extension file. */
const NATIVE_BRIDGE_EXTENSION = resolve(
  import.meta.dirname,
  "../../extensions/native-bridge.ts",
);

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
  readonly capabilities: SandboxProviderCapabilities = {
    losslessPause: true,
    persistentDisk: true,
  };
  private docker: Docker;
  private config: Required<
    Pick<DockerProviderConfig, "image" | "networkMode" | "containerPrefix">
  > & {
    sessionDataDir: string;
    secretsBaseDir?: string;
  };
  /** Optional cache of handles — Docker is always the source of truth. */
  private handleCache = new Map<string, DockerSandboxHandle>();
  /** Track secrets directories for cleanup */
  private secretsDirs = new Map<string, string>();
  private logStore: SandboxLogStore | null;

  constructor(config: DockerProviderConfig, logStore?: SandboxLogStore) {
    const socketPath = config.socketPath ?? this.resolveDockerSocket();
    this.docker = new Docker({ socketPath });
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.logStore = logStore ?? null;
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
      githubToken,
      gitAuthorName,
      gitAuthorEmail,
      nativeToolsEnabled,
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

    // Set up git configuration (credentials + user identity)
    const gitDir = join(sessionDir, "git");
    writeGitConfig(gitDir, {
      githubToken,
      gitAuthorName,
      gitAuthorEmail,
      credentialHelperPath: "/data/git",
    });

    // If repo URL provided, clone it into the workspace dir
    if (repoUrl) {
      await this.cloneRepoIntoDir(
        workspaceDir,
        repoUrl,
        repoBranch,
        githubToken,
      );
    }

    // Build environment variables (non-secret config only)
    const containerEnv = [
      ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
      `PI_SESSION_ID=${sessionId}`,
      "GIT_CONFIG_GLOBAL=/data/git/gitconfig",
    ];

    if (githubToken) {
      containerEnv.push(`GH_TOKEN=${githubToken}`);
    }

    // Create secrets directory on host and write secret files
    const secretsDir = this.writeSecretsDir(sessionId, secrets);
    const binds = [
      `${workspaceDir}:/workspace`,
      `${agentDir}:/data/agent`,
      `${gitDir}:/data/git:ro`,
    ];

    if (secretsDir) {
      binds.push(`${secretsDir}:/run/secrets:ro`);
      containerEnv.push("PI_SECRETS_DIR=/run/secrets");
    }

    // Mount native bridge extension if enabled
    const containerExtensionPaths: string[] = [];
    if (nativeToolsEnabled) {
      const containerPath = "/run/extensions/native-bridge.ts";
      binds.push(`${NATIVE_BRIDGE_EXTENSION}:${containerPath}:ro`);
      containerExtensionPaths.push(containerPath);
    }

    // Resource limits from tier
    const tier = options.resourceTier ?? DEFAULT_TIER;
    const limits = RESOURCE_TIER_LIMITS[tier];
    const cpuShares = limits.cpuShares;
    const memoryMB = limits.memoryMB;

    const hostUser = getHostUser();

    // Build Cmd: override image default if extensions are provided
    const cmd =
      containerExtensionPaths.length > 0
        ? [
            "pi",
            "--mode",
            "rpc",
            "--continue",
            ...containerExtensionPaths.flatMap((p) => ["-e", p]),
          ]
        : ["pi", "--mode", "rpc", "--continue"];

    // Always pull to get latest image (digest is stored per-session)
    await this.pullImage(this.config.image);

    // Create container
    const container = await this.docker.createContainer({
      name: containerName,
      Image: this.config.image,
      User: hostUser,
      Env: containerEnv,
      WorkingDir: "/workspace",
      ...(cmd && { Cmd: cmd }),
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
      (sid, t) => this.writeGitConfigForSession(sid, t),
      this.logStore,
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
      (sid, t) => this.writeGitConfigForSession(sid, t),
      this.logStore,
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
    let sandboxesRemoved = 0;
    const artifactsRemoved = 0;

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
        sandboxesRemoved++;

        // Clean up cached handle
        const sessionId =
          c.Names[0]?.replace(`/${this.config.containerPrefix}-`, "") ?? "";
        this.handleCache.delete(sessionId);
        this.cleanupSecretsDir(sessionId);
      } catch (err) {
        log.error(
          { err, containerId: c.Id },
          "cleanup: failed to remove container",
        );
      }
    }

    return { sandboxesRemoved, artifactsRemoved };
  }

  // --- Private helpers ---

  /**
   * Pull a Docker image. Always pulls to ensure we have the latest
   * version and store an up-to-date digest.
   * Falls back to local image if pull fails (e.g. offline, local-only tag).
   */
  private async pullImage(image: string): Promise<void> {
    try {
      log.info({ image }, "pulling image");
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: Error | null) =>
          err ? reject(err) : resolve(),
        );
      });
      log.info({ image }, "image pulled");
    } catch (err) {
      // If pull fails, check if image exists locally
      try {
        await this.docker.getImage(image).inspect();
        log.warn(
          {
            image,
            pullError: err instanceof Error ? err.message : String(err),
          },
          "pull failed, using local image",
        );
      } catch {
        throw new Error(
          `Image ${image} not available: pull failed and not found locally`,
        );
      }
    }
  }

  /**
   * Write git credential helper and gitconfig to a directory.
   * The directory is bind-mounted read-only into the container at /data/git.
   * GIT_CONFIG_GLOBAL=/data/git/gitconfig points git to the config.
   */
  /**
   * Write git config for a session. Called at creation and on resume.
   */
  private writeGitConfigForSession(
    sessionId: string,
    githubToken?: string,
  ): void {
    const gitDir = join(this.getSessionDataPath(sessionId), "git");
    writeGitConfig(gitDir, { githubToken, credentialHelperPath: "/data/git" });
  }

  private async cloneRepoIntoDir(
    workspaceDir: string,
    repoUrl: string,
    branch?: string,
    githubToken?: string,
  ): Promise<void> {
    // For private repos, embed token in the clone URL so the ephemeral
    // clone container doesn't need the full git config setup.
    const effectiveUrl =
      githubToken && repoUrl.startsWith("https://github.com/")
        ? repoUrl.replace(
            "https://github.com/",
            `https://x-access-token:${githubToken}@github.com/`,
          )
        : repoUrl;

    const branchArg = branch ? `--branch ${branch}` : "";
    // Clone with the (possibly token-embedded) URL, then reset the remote
    // to the clean URL so the token doesn't persist in .git/config.
    const resetRemote =
      effectiveUrl !== repoUrl
        ? ` && git -C /workspace remote set-url origin '${repoUrl}'`
        : "";
    const cmd = `git clone ${branchArg} ${effectiveUrl} /workspace${resetRemote}`;

    const hostUser = getHostUser();

    await this.pullImage(this.config.image);

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
      } catch (err) {
        log.error({ err }, "clone: failed to capture container logs");
      }
      try {
        await container.remove();
      } catch (err) {
        log.error({ err }, "clone: failed to remove container");
      }
      const detail = output ? `\n${output}` : "";
      throw new Error(
        `Failed to clone repo: exit code ${result.StatusCode}${detail}`,
      );
    }

    // Clean up on success
    try {
      await container.remove();
    } catch (err) {
      log.error({ err }, "clone: failed to remove container");
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
   * Uses safe filenames (s-0, s-1, ...) and a manifest file mapping
   * env var names to filenames, to avoid path traversal via envVar.
   *
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

    const manifestLines: string[] = [];
    let idx = 0;

    for (const [envName, value] of Object.entries(secrets)) {
      const filename = `s-${idx}`;
      const filepath = join(secretsDir, filename);
      // chmod 0o600 first to allow overwrite on resume, then lock to 0o400
      try {
        chmodSync(filepath, 0o600);
      } catch {
        // File may not exist yet
      }
      writeFileSync(filepath, value, { mode: 0o400 });
      manifestLines.push(`${envName}\t${filename}`);
      idx++;
    }

    // Write manifest (env_var<TAB>filename per line)
    const manifestPath = join(secretsDir, "manifest");
    try {
      chmodSync(manifestPath, 0o600);
    } catch {
      // File may not exist yet
    }
    writeFileSync(manifestPath, `${manifestLines.join("\n")}\n`, {
      mode: 0o400,
    });

    this.secretsDirs.set(sessionId, secretsDir);
    return secretsDir;
  }

  private cleanupSecretsDir(sessionId: string): void {
    const secretsDir = this.secretsDirs.get(sessionId);
    if (secretsDir) {
      try {
        rmSync(secretsDir, { recursive: true, force: true });
      } catch (err) {
        log.error({ err, sessionId }, "failed to clean up secrets dir");
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
  private currentChannel: DockerSandboxChannel | null = null;

  constructor(
    readonly sessionId: string,
    private container: Docker.Container,
    private _imageDigest: string,
    private writeSecrets?: (
      sessionId: string,
      secrets?: Record<string, string>,
    ) => string | null,
    private writeGitConfig?: (sessionId: string, githubToken?: string) => void,
    private logStore?: SandboxLogStore | null,
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

  async resume(
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Promise<void> {
    // Refresh secrets and git config on host before resuming
    // (bind mounts pick them up)
    if (secrets && this.writeSecrets) {
      this.writeSecrets(this.sessionId, secrets);
    }
    if (this.writeGitConfig) {
      this.writeGitConfig(this.sessionId, githubToken);
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

  async exec(command: string): Promise<{ exitCode: number; output: string }> {
    if (this._status !== "running") {
      throw new Error("Cannot exec: container is not running");
    }

    const exec = await this.container.exec({
      Cmd: ["/bin/sh", "-c", command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    this.container.modem.demuxStream(stream, stdout, stderr);

    const chunks: Buffer[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      stream.on("end", resolve);
    });

    const inspect = await exec.inspect();
    return {
      exitCode: inspect.ExitCode ?? 0,
      output: Buffer.concat(chunks).toString("utf-8"),
    };
  }

  async openPty(cols: number, rows: number): Promise<PtyHandle> {
    if (this._status !== "running") {
      throw new Error("Cannot openPty: container is not running");
    }

    const exec = await this.container.exec({
      Cmd: ["/bin/bash", "-l"],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: [`TERM=xterm-256color`, `COLUMNS=${cols}`, `LINES=${rows}`],
    });

    const stream = (await exec.start({
      hijack: true,
      stdin: true,
    })) as Duplex;

    const dataListeners = new Set<(data: string) => void>();
    const exitListeners = new Set<(code: number) => void>();

    // With Tty: true, docker doesn't multiplex -- raw output on stream
    stream.on("data", (chunk: Buffer) => {
      const str = chunk.toString("utf-8");
      for (const listener of dataListeners) {
        listener(str);
      }
    });

    stream.on("end", () => {
      exec
        .inspect()
        .then((info) => {
          const code = info.ExitCode ?? 0;
          for (const listener of exitListeners) {
            listener(code);
          }
        })
        .catch(() => {
          for (const listener of exitListeners) {
            listener(1);
          }
        });
    });

    return {
      write(data: string) {
        stream.write(data);
      },
      onData(handler: (data: string) => void) {
        dataListeners.add(handler);
        return () => dataListeners.delete(handler);
      },
      onExit(handler: (exitCode: number) => void) {
        exitListeners.add(handler);
        return () => exitListeners.delete(handler);
      },
      resize(c: number, r: number) {
        exec.resize({ w: c, h: r }).catch(() => {});
      },
      close() {
        stream.end();
        dataListeners.clear();
        exitListeners.clear();
      },
    };
  }

  async attach(): Promise<SandboxChannel> {
    // If already attached, close old channel first
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    // Ensure container is running before attaching
    const info = await this.container.inspect();
    if (!info.State.Running) {
      const state = info.State.Status;
      if (state === "exited" || state === "created") {
        log.info(
          { containerId: this.container.id, state },
          "starting container before attach",
        );
        await this.container.start();
        this.setStatus("running");
      } else {
        throw new Error(
          `Cannot attach: container ${this.container.id} is not running (state: ${state})`,
        );
      }
    }

    const stream = await this.container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    });

    const raw = stream as unknown as Duplex;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    this.container.modem.demuxStream(raw, stdout, stderr);

    const channel = new DockerSandboxChannel(
      raw,
      stdout,
      stderr,
      this.sessionId,
      this.logStore ?? undefined,
    );
    this.currentChannel = channel;

    // Monitor container for unexpected exits
    this.monitorContainer();

    return channel;
  }

  async pause(): Promise<void> {
    // Close channel before pausing
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    await this.container.pause();
    this.setStatus("paused");
  }

  async terminate(): Promise<void> {
    // Close channel
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    try {
      await this.container.stop({ t: 10 });
    } catch (err) {
      log.error(
        { err, containerId: this.container.id },
        "terminate: failed to stop container",
      );
    }
    try {
      await this.container.remove({ force: true });
    } catch (err) {
      log.error(
        { err, containerId: this.container.id },
        "terminate: failed to remove container",
      );
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
    } catch (err) {
      log.error(
        { err, containerId: this.container.id },
        "container monitor error",
      );
      this.setStatus("error");
    }
  }
}

/**
 * Adapts Docker container attach streams into a message-oriented SandboxChannel.
 * Uses readline internally to split the demuxed stdout into JSON lines.
 */
class DockerSandboxChannel implements SandboxChannel {
  private closed = false;
  private messageHandlers = new Set<(message: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private rl: readline.Interface;

  constructor(
    private raw: Duplex,
    stdout: PassThrough,
    stderr: PassThrough,
    sessionId?: string,
    logStore?: SandboxLogStore,
  ) {
    // Split stdout into lines (each line is a complete JSON message from pi)
    this.rl = readline.createInterface({ input: stdout });

    this.rl.on("line", (line) => {
      if (this.closed) return;
      for (const handler of this.messageHandlers) {
        handler(line);
      }
    });

    this.rl.on("close", () => {
      if (this.closed) return;
      this.notifyClose("stream closed");
    });

    // Add no-op error handlers to prevent crashes on late writes
    raw.on("error", () => {});
    stdout.on("error", () => {});
    stderr.on("error", () => {});

    // Log stderr for debugging and buffer for REST access
    const stderrRl = readline.createInterface({ input: stderr });
    stderrRl.on("line", (line) => {
      if (line.trim()) {
        log.debug({ sessionId, line }, "sandbox stderr");
        if (sessionId && logStore) {
          logStore.append(sessionId, line);
        }
      }
    });
  }

  send(message: string): void {
    if (this.closed) return;
    // Docker expects newline-delimited JSON on stdin
    this.raw.write(`${message}\n`);
  }

  onMessage(handler: (message: string) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onClose(handler: (reason?: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.rl.close();
    this.raw.destroy();
    this.raw.removeAllListeners();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  private notifyClose(reason?: string): void {
    this.closed = true;
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }
}
