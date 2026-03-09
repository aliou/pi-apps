import {
  type ChildProcessWithoutNullStreams,
  exec as execCallback,
  spawn,
} from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import readline from "node:readline";
import { promisify } from "node:util";
import type { IPty } from "node-pty";
import { spawn as spawnPty } from "node-pty";
import { createLogger } from "../lib/logger";
import { writeGitConfig } from "./git-config";
import type { SandboxLogStore } from "./log-store";
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

const logger = createLogger("local");
const execAsync = promisify(execCallback);

const NATIVE_BRIDGE_EXTENSION = resolve(
  import.meta.dirname,
  "../../extensions/native-bridge.ts",
);

const DEFAULT_PI_BINARY = "pi";
const DEFAULT_PROVIDER_ID_SENTINEL = "_";

export interface LocalProviderConfig {
  sessionDataDir: string;
  piBinaryPath?: string;
}

function encodeWorkspacePath(workspacePath?: string): string {
  const value = workspacePath ?? "";
  return value
    ? Buffer.from(value, "utf8").toString("base64url")
    : DEFAULT_PROVIDER_ID_SENTINEL;
}

function decodeWorkspacePath(encoded: string): string | undefined {
  if (!encoded || encoded === DEFAULT_PROVIDER_ID_SENTINEL) {
    return undefined;
  }
  return Buffer.from(encoded, "base64url").toString("utf8");
}

function buildProviderId(sessionId: string, workspacePath?: string): string {
  return `local:${sessionId}:${encodeWorkspacePath(workspacePath)}`;
}

function parseProviderId(providerId: string): {
  sessionId: string;
  workspacePath?: string;
} {
  const [provider, sessionId, encodedWorkspacePath] = providerId.split(":");
  if (provider !== "local" || !sessionId || !encodedWorkspacePath) {
    throw new Error(`Invalid local provider ID: ${providerId}`);
  }
  return {
    sessionId,
    workspacePath: decodeWorkspacePath(encodedWorkspacePath),
  };
}

function getLocalShell(): { file: string; args: string[] } {
  if (process.platform === "win32") {
    const powershell = process.env.ComSpec || "powershell.exe";
    return { file: powershell, args: [] };
  }

  // Try $SHELL first, then common fallbacks.
  const candidates = [
    process.env.SHELL?.trim(),
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const name = basename(candidate);
      const loginArgs =
        name === "bash" || name === "zsh" || name === "fish" ? ["-l"] : [];
      return { file: candidate, args: loginArgs };
    }
  }

  // Last resort: rely on PATH resolution.
  return { file: "sh", args: [] };
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilities: SandboxProviderCapabilities = {
    losslessPause: false,
    persistentDisk: true,
  };

  private config: Required<Pick<LocalProviderConfig, "sessionDataDir">> & {
    piBinaryPath?: string;
  };
  private handles = new Map<string, LocalSandboxHandle>();
  private logStore: SandboxLogStore | null;

  constructor(config: LocalProviderConfig, logStore?: SandboxLogStore) {
    this.config = {
      sessionDataDir: config.sessionDataDir,
      piBinaryPath: config.piBinaryPath?.trim() || undefined,
    };
    this.logStore = logStore ?? null;
  }

  async isAvailable(): Promise<boolean> {
    const piBinary = this.config.piBinaryPath ?? DEFAULT_PI_BINARY;

    try {
      const child = spawn(piBinary, ["--version"], {
        stdio: ["ignore", "ignore", "ignore"],
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      });

      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const workspacePath = options.workspacePath?.trim() || undefined;
    const providerId = buildProviderId(options.sessionId, workspacePath);
    const existing = this.handles.get(providerId);
    if (
      existing &&
      existing.status !== "stopped" &&
      existing.status !== "error"
    ) {
      return existing;
    }

    const handle = new LocalSandboxHandle({
      sessionId: options.sessionId,
      providerId,
      workspacePath,
      sessionDataDir: this.config.sessionDataDir,
      piBinaryPath: this.config.piBinaryPath ?? DEFAULT_PI_BINARY,
      baseEnv: options.env,
      nativeToolsEnabled: options.nativeToolsEnabled ?? false,
      githubToken: options.githubToken,
      gitAuthorName: options.gitAuthorName,
      gitAuthorEmail: options.gitAuthorEmail,
      logStore: this.logStore ?? undefined,
    });

    await handle.resume(
      options.secrets,
      options.githubToken,
      options.secretMaterial,
    );
    this.handles.set(providerId, handle);
    return handle;
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    const existing = this.handles.get(providerId);
    if (existing) {
      return existing;
    }

    // Handle lost (e.g., server restart). Reconstruct from providerId.
    // The session data dir persists on disk, so pi --continue picks up
    // the existing conversation. resume() will spawn the process.
    const { sessionId, workspacePath } = parseProviderId(providerId);
    logger.info(
      { sessionId, providerId },
      "reconstructing local sandbox handle after restart",
    );

    const handle = new LocalSandboxHandle({
      sessionId,
      providerId,
      workspacePath,
      sessionDataDir: this.config.sessionDataDir,
      piBinaryPath: this.config.piBinaryPath ?? DEFAULT_PI_BINARY,
      logStore: this.logStore ?? undefined,
    });

    this.handles.set(providerId, handle);
    return handle;
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    return Array.from(this.handles.values()).map((handle) => ({
      sessionId: handle.sessionId,
      providerId: handle.providerId,
      status: handle.status,
      createdAt: handle.createdAt,
    }));
  }

  async cleanup(): Promise<CleanupResult> {
    let sandboxesRemoved = 0;
    for (const [providerId, handle] of this.handles) {
      if (handle.status === "stopped" || handle.status === "error") {
        this.handles.delete(providerId);
        sandboxesRemoved += 1;
      }
    }
    return { sandboxesRemoved, artifactsRemoved: 0 };
  }
}

interface LocalHandleOptions {
  sessionId: string;
  providerId: string;
  workspacePath?: string;
  sessionDataDir: string;
  piBinaryPath: string;
  baseEnv?: Record<string, string>;
  nativeToolsEnabled?: boolean;
  githubToken?: string;
  gitAuthorName?: string;
  gitAuthorEmail?: string;
  logStore?: SandboxLogStore;
}

class LocalSandboxHandle implements SandboxHandle {
  readonly sessionId: string;
  readonly providerId: string;
  readonly createdAt: string;

  private _status: SandboxStatus = "stopped";
  private child: ChildProcessWithoutNullStreams | null = null;
  private currentChannel: LocalSandboxChannel | null = null;
  private activePtys = new Set<LocalPtyHandle>();
  private statusHandlers = new Set<(status: SandboxStatus) => void>();
  private sessionDir: string;
  private workspacePath: string;
  private agentDir: string;
  private gitDir: string;
  private workspaceManagedBySession: boolean;
  private piBinaryPath: string;
  private baseEnv: Record<string, string>;
  private runtimeEnv: Record<string, string> = {};
  private nativeToolsEnabled: boolean;
  private githubToken?: string;
  private gitAuthorName?: string;
  private gitAuthorEmail?: string;
  private pendingExitStatus: SandboxStatus | null = null;
  private logStore?: SandboxLogStore;

  constructor(options: LocalHandleOptions) {
    this.sessionId = options.sessionId;
    this.providerId = options.providerId;
    this.createdAt = new Date().toISOString();
    this.sessionDir = join(options.sessionDataDir, options.sessionId);
    this.workspaceManagedBySession = !options.workspacePath;
    this.workspacePath =
      options.workspacePath ?? join(this.sessionDir, "workspace");
    this.agentDir = join(this.sessionDir, "agent");
    this.gitDir = join(this.sessionDir, "git");
    this.piBinaryPath = options.piBinaryPath;
    this.baseEnv = options.baseEnv ?? {};
    this.nativeToolsEnabled = options.nativeToolsEnabled ?? false;
    this.githubToken = options.githubToken;
    this.gitAuthorName = options.gitAuthorName;
    this.gitAuthorEmail = options.gitAuthorEmail;
    this.logStore = options.logStore;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async resume(
    secrets?: Record<string, string>,
    githubToken?: string,
    _secretMaterial?: import("./types").SandboxSecretMaterial,
  ): Promise<void> {
    if (githubToken !== undefined) {
      this.githubToken = githubToken;
    }

    this.ensureDirs();
    this.writeGitConfig();
    this.runtimeEnv = this.buildRuntimeEnv(secrets, this.githubToken);

    if (this.child && this._status === "running") {
      return;
    }

    await this.spawnPi();
  }

  async exec(command: string): Promise<{ exitCode: number; output: string }> {
    const env = this.runtimeEnv;
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workspacePath,
        env,
      });
      return { exitCode: 0, output: `${stdout}${stderr}` };
    } catch (error) {
      if (error instanceof Error) {
        const execError = error as Error & {
          code?: number;
          stdout?: string;
          stderr?: string;
        };
        return {
          exitCode: execError.code ?? 1,
          output: `${execError.stdout ?? ""}${execError.stderr ?? ""}`,
        };
      }
      throw error;
    }
  }

  async openPty(cols: number, rows: number): Promise<PtyHandle> {
    if (this._status !== "running") {
      throw new Error("Cannot openPty: local sandbox is not running");
    }

    if (Object.keys(this.runtimeEnv).length === 0) {
      this.ensureDirs();
      this.writeGitConfig();
      this.runtimeEnv = this.buildRuntimeEnv(undefined, this.githubToken);
    }

    const shell = getLocalShell();
    const env = {
      ...this.runtimeEnv,
      TERM: this.runtimeEnv.TERM || "xterm-256color",
      COLORTERM: this.runtimeEnv.COLORTERM || "truecolor",
    };

    const pty = spawnPty(shell.file, shell.args, {
      name: env.TERM,
      cwd: this.workspacePath,
      env,
      cols,
      rows,
    });

    const handle = new LocalPtyHandle(pty, () => {
      this.activePtys.delete(handle);
    });
    this.activePtys.add(handle);
    return handle;
  }

  async attach(): Promise<SandboxChannel> {
    if (!this.child || this._status !== "running") {
      throw new Error("Cannot attach: local sandbox is not running");
    }

    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    const channel = new LocalSandboxChannel(
      this.child,
      this.sessionId,
      this.logStore,
    );
    this.currentChannel = channel;
    return channel;
  }

  async pause(): Promise<void> {
    await this.stopChild("paused");
  }

  async terminate(): Promise<void> {
    await this.stopChild("stopped");
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private ensureDirs(): void {
    mkdirSync(this.sessionDir, { recursive: true });
    if (this.workspaceManagedBySession) {
      mkdirSync(this.workspacePath, { recursive: true });
    } else if (
      !existsSync(this.workspacePath) ||
      !statSync(this.workspacePath).isDirectory()
    ) {
      throw new Error(`Local workspace does not exist: ${this.workspacePath}`);
    }
    mkdirSync(this.agentDir, { recursive: true });
    mkdirSync(this.gitDir, { recursive: true });
    mkdirSync(join(this.agentDir, "data"), { recursive: true });
    mkdirSync(join(this.agentDir, "config"), { recursive: true });
    mkdirSync(join(this.agentDir, "cache"), { recursive: true });
    mkdirSync(join(this.agentDir, "state"), { recursive: true });
    mkdirSync(join(this.agentDir, "npm"), { recursive: true });

    // Copy the host's auth.json so pi can use OAuth-gated providers
    // (e.g. Anthropic). Without this, the isolated agent dir has no
    // OAuth tokens and pi rejects those providers as unavailable.
    this.copyHostAuth();
  }

  /**
   * Copy the host's auth.json into this sandbox's agent dir.
   * No-op if the host file doesn't exist or the sandbox already has one.
   */
  private copyHostAuth(): void {
    const dest = join(this.agentDir, "auth.json");
    if (existsSync(dest)) return;

    const hostAgentDir =
      process.env.PI_CODING_AGENT_DIR ||
      join(process.env.HOME || process.env.USERPROFILE || "", ".pi", "agent");
    const src = join(hostAgentDir, "auth.json");
    if (!existsSync(src)) return;

    try {
      copyFileSync(src, dest);
      logger.debug({ sessionId: this.sessionId }, "copied host auth.json to sandbox");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ sessionId: this.sessionId, err: message }, "failed to copy host auth.json");
    }
  }

  private writeGitConfig(): void {
    writeGitConfig(this.gitDir, {
      githubToken: this.githubToken,
      gitAuthorName: this.gitAuthorName,
      gitAuthorEmail: this.gitAuthorEmail,
      credentialHelperPath: this.gitDir,
      safeDirectories: [this.workspacePath],
    });
  }

  private buildRuntimeEnv(
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Record<string, string> {
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      ...this.baseEnv,
      ...(secrets ?? {}),
      PI_SESSION_ID: this.sessionId,
      PI_CODING_AGENT_DIR: this.agentDir,
      npm_config_prefix: join(this.agentDir, "npm"),
      GIT_CONFIG_GLOBAL: join(this.gitDir, "gitconfig"),
      XDG_DATA_HOME: join(this.agentDir, "data"),
      XDG_CONFIG_HOME: join(this.agentDir, "config"),
      XDG_CACHE_HOME: join(this.agentDir, "cache"),
      XDG_STATE_HOME: join(this.agentDir, "state"),
    };

    if (githubToken) {
      env.GH_TOKEN = githubToken;
    }

    return env;
  }

  private async spawnPi(): Promise<void> {
    this.currentChannel?.close();
    this.currentChannel = null;
    this.setStatus("creating");

    const args = ["--mode", "rpc", "--continue"];
    if (this.nativeToolsEnabled) {
      args.push("-e", NATIVE_BRIDGE_EXTENSION);
    }

    const child = spawn(this.piBinaryPath, args, {
      cwd: this.workspacePath,
      env: this.runtimeEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;

    await new Promise<void>((resolve, reject) => {
      let started = false;

      child.once("spawn", () => {
        started = true;
        this.setStatus("running");
        resolve();
      });

      child.once("error", (err) => {
        if (!started) {
          this.child = null;
          this.setStatus("error");
          reject(new Error(`Failed to spawn pi: ${err.message}`));
          return;
        }
        logger.error(
          { err, sessionId: this.sessionId },
          "local pi process error",
        );
      });

      child.once("exit", (code, signal) => {
        const status = this.pendingExitStatus ?? "stopped";
        this.pendingExitStatus = null;
        if (this.child === child) {
          this.child = null;
        }
        this.currentChannel?.notifyProcessExit(
          signal ? `pi exited (${signal})` : `pi exited (${code ?? 0})`,
        );
        this.currentChannel = null;
        this.setStatus(status);

        if (!started) {
          reject(
            new Error(
              signal
                ? `pi exited before startup (${signal})`
                : `pi exited before startup (${code ?? 0})`,
            ),
          );
        }
      });
    });
  }

  private async stopChild(nextStatus: SandboxStatus): Promise<void> {
    this.closeActivePtys();

    const child = this.child;
    if (!child) {
      this.setStatus(nextStatus);
      return;
    }

    this.currentChannel?.close();
    this.currentChannel = null;
    this.pendingExitStatus = nextStatus;

    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });

    child.kill("SIGTERM");
    const forced = setTimeout(() => {
      if (this.child === child) {
        child.kill("SIGKILL");
      }
    }, 5_000);

    await exited;
    clearTimeout(forced);
  }

  private closeActivePtys(): void {
    for (const pty of this.activePtys) {
      pty.close();
    }
    this.activePtys.clear();
  }

  private setStatus(status: SandboxStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}

class LocalPtyHandle implements PtyHandle {
  private closed = false;
  private dataHandlers = new Set<(data: string) => void>();
  private exitHandlers = new Set<(exitCode: number) => void>();
  private disposeOnData: { dispose(): void } | null = null;
  private disposeOnExit: { dispose(): void } | null = null;

  constructor(
    private pty: IPty,
    private onDispose: () => void,
  ) {
    this.disposeOnData = this.pty.onData((data) => {
      for (const handler of this.dataHandlers) {
        handler(data);
      }
    });

    this.disposeOnExit = this.pty.onExit(({ exitCode }) => {
      for (const handler of this.exitHandlers) {
        handler(exitCode);
      }
      this.close();
    });
  }

  write(data: string): void {
    if (this.closed) return;
    this.pty.write(data);
  }

  onData(handler: (data: string) => void): () => void {
    this.dataHandlers.add(handler);
    return () => this.dataHandlers.delete(handler);
  }

  onExit(handler: (exitCode: number) => void): () => void {
    this.exitHandlers.add(handler);
    return () => this.exitHandlers.delete(handler);
  }

  resize(cols: number, rows: number): void {
    if (this.closed) return;
    this.pty.resize(cols, rows);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.disposeOnData?.dispose();
    this.disposeOnExit?.dispose();
    this.disposeOnData = null;
    this.disposeOnExit = null;
    try {
      this.pty.kill();
    } catch {
      // Process may already be dead.
    }
    this.dataHandlers.clear();
    this.exitHandlers.clear();
    this.onDispose();
  }
}

class LocalSandboxChannel implements SandboxChannel {
  private closed = false;
  private messageHandlers = new Set<(message: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private stdoutRl: readline.Interface;
  private stderrRl: readline.Interface;

  constructor(
    private child: ChildProcessWithoutNullStreams,
    private sessionId: string,
    private logStore?: SandboxLogStore,
  ) {
    this.stdoutRl = readline.createInterface({ input: child.stdout });
    this.stderrRl = readline.createInterface({ input: child.stderr });

    this.stdoutRl.on("line", (line) => {
      if (this.closed) return;
      for (const handler of this.messageHandlers) {
        handler(line);
      }
    });

    this.stderrRl.on("line", (line) => {
      if (!line.trim()) return;
      logger.debug({ sessionId: this.sessionId, line }, "local sandbox stderr");
      this.logStore?.append(this.sessionId, line);
    });
  }

  send(message: string): void {
    if (this.closed) return;
    this.child.stdin.write(`${message}\n`);
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
    this.stdoutRl.close();
    this.stderrRl.close();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  notifyProcessExit(reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
    this.stdoutRl.close();
    this.stderrRl.close();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }
}
