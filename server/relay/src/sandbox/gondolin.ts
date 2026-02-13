import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import readline from "node:readline";
import {
  type ExecProcess,
  VM as GondolinVM,
  RealFSProvider,
  type VM,
} from "@earendil-works/gondolin";
import type { SandboxLogStore } from "./log-store";
import type { SandboxResourceTier } from "./provider-types";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxChannel,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxProviderCapabilities,
  SandboxStatus,
} from "./types";

const DEFAULT_TIER: SandboxResourceTier = "medium";
const DEFAULT_SOURCE_IMAGE = "ghcr.io/aliou/pi-sandbox-alpine-arm64:latest";

const RESOURCE_TIER_SPECS: Record<
  SandboxResourceTier,
  { memory: string; cpus: number }
> = {
  small: { memory: "1024M", cpus: 1 },
  medium: { memory: "2048M", cpus: 2 },
  large: { memory: "4096M", cpus: 4 },
};

const MODEL_KEY_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "TOGETHER_API_KEY",
] as const;

function hasAssets(dir: string): boolean {
  return ["manifest.json", "vmlinuz-virt", "initramfs.cpio.lz4", "rootfs.ext4"]
    .map((name) => join(dir, name))
    .every((path) => existsSync(path));
}

function ensureModelEnvFallback(env: Record<string, string>): void {
  const hasModelKey = MODEL_KEY_ENV_VARS.some((key) => {
    const value = env[key];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (!hasModelKey) {
    env.ANTHROPIC_API_KEY = "test-key";
  }
}

function getCacheRoot(): string {
  if (process.env.PI_RELAY_CACHE_DIR) {
    return process.env.PI_RELAY_CACHE_DIR;
  }
  return join(process.cwd(), ".dev", "relay", "cache");
}

function getDefaultImageOutPath(): string {
  return process.env.GONDOLIN_IMAGE_OUT
    ? resolve(process.env.GONDOLIN_IMAGE_OUT)
    : join(getCacheRoot(), "gondolin-custom", "pi-runtime-docker2vm");
}

function getDocker2VmDir(): string {
  return join(getCacheRoot(), "docker2vm-src");
}

type GondolinSessionMeta = {
  resourceTier: SandboxResourceTier;
  nativeToolsEnabled: boolean;
  imagePath?: string;
};

export interface GondolinProviderConfig {
  /** Base directory for per-session data on host. */
  sessionDataDir: string;
  /** Optional path to prebuilt Gondolin guest assets directory. */
  imagePath?: string;
}

export class GondolinSandboxProvider implements SandboxProvider {
  readonly name = "gondolin";
  readonly capabilities: SandboxProviderCapabilities = {
    losslessPause: false,
    persistentDisk: true,
  };

  private config: GondolinProviderConfig;
  private handleCache = new Map<string, GondolinSandboxHandle>();
  private logStore: SandboxLogStore | null;
  private resolvedImagePathPromise: Promise<string> | null = null;

  constructor(config: GondolinProviderConfig, logStore?: SandboxLogStore) {
    this.config = config;
    this.logStore = logStore ?? null;
  }

  async isAvailable(): Promise<boolean> {
    let vm: VM | null = null;

    try {
      const imagePath = await this.resolveImagePath();
      vm = await GondolinVM.create({
        sandbox: { imagePath },
      });

      const probe = await vm.exec("pi --version", {
        signal: AbortSignal.timeout(20_000),
      });
      return probe.exitCode === 0;
    } catch {
      return false;
    } finally {
      if (vm) {
        await vm.close().catch(() => undefined);
      }
    }
  }

  getSessionDataPath(sessionId: string): string {
    return join(this.config.sessionDataDir, sessionId);
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const {
      sessionId,
      secrets,
      repoUrl,
      repoBranch,
      githubToken,
      nativeToolsEnabled,
    } = options;

    const cached = this.handleCache.get(sessionId);
    if (cached && cached.status !== "stopped" && cached.status !== "error") {
      return cached;
    }

    const sessionDir = this.getSessionDataPath(sessionId);
    const workspaceDir = join(sessionDir, "workspace");
    const agentDir = join(sessionDir, "agent");
    const gitDir = join(sessionDir, "git");

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    this.setupGitConfig(gitDir, githubToken);

    if (repoUrl) {
      await this.cloneRepoIntoDir(
        workspaceDir,
        repoUrl,
        repoBranch,
        githubToken,
      );
    }

    const tier = options.resourceTier ?? DEFAULT_TIER;
    const imagePath = this.config.imagePath;

    this.writeSessionMeta(sessionId, {
      resourceTier: tier,
      nativeToolsEnabled: Boolean(nativeToolsEnabled),
      ...(imagePath ? { imagePath } : {}),
    });

    const vm = await this.createVm({
      sessionId,
      secrets,
      nativeToolsEnabled: Boolean(nativeToolsEnabled),
      tier,
      imagePath,
    });

    const handle = new GondolinSandboxHandle(
      {
        sessionId,
        vm,
        imagePath,
        sessionDir,
        nativeToolsEnabled: Boolean(nativeToolsEnabled),
        resourceTier: tier,
        initialStatus: "running",
      },
      {
        createVm: (args) => this.createVm(args),
        writeGitConfig: (sid, token) =>
          this.writeGitConfigForSession(sid, token),
        logStore: this.logStore,
      },
    );

    this.handleCache.set(sessionId, handle);
    return handle;
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    const sessionId = this.parseProviderId(providerId);

    const cached = this.handleCache.get(sessionId);
    if (cached && cached.status !== "stopped") {
      return cached;
    }

    const sessionDir = this.getSessionDataPath(sessionId);
    if (!existsSync(sessionDir)) {
      throw new Error(`Sandbox not found: ${providerId}`);
    }

    const meta = this.readSessionMeta(sessionId);
    const handle = new GondolinSandboxHandle(
      {
        sessionId,
        vm: null,
        imagePath: meta?.imagePath ?? this.config.imagePath,
        sessionDir,
        nativeToolsEnabled: meta?.nativeToolsEnabled ?? false,
        resourceTier: meta?.resourceTier ?? DEFAULT_TIER,
        initialStatus: "paused",
      },
      {
        createVm: (args) => this.createVm(args),
        writeGitConfig: (sid, token) =>
          this.writeGitConfigForSession(sid, token),
        logStore: this.logStore,
      },
    );

    this.handleCache.set(sessionId, handle);
    return handle;
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    return Array.from(this.handleCache.values())
      .filter((h) => h.status !== "stopped")
      .map((h) => ({
        sessionId: h.sessionId,
        providerId: h.providerId,
        status: h.status,
        createdAt: new Date().toISOString(),
      }));
  }

  async cleanup(): Promise<CleanupResult> {
    let sandboxesRemoved = 0;

    for (const [sessionId, handle] of this.handleCache) {
      if (handle.status === "stopped" || handle.status === "error") {
        this.handleCache.delete(sessionId);
        sandboxesRemoved++;
      }
    }

    return { sandboxesRemoved, artifactsRemoved: 0 };
  }

  private parseProviderId(providerId: string): string {
    return providerId.startsWith("gondolin-")
      ? providerId.slice("gondolin-".length)
      : providerId;
  }

  private getSessionMetaPath(sessionId: string): string {
    return join(this.getSessionDataPath(sessionId), "gondolin-meta.json");
  }

  private writeSessionMeta(sessionId: string, meta: GondolinSessionMeta): void {
    const sessionDir = this.getSessionDataPath(sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      this.getSessionMetaPath(sessionId),
      JSON.stringify(meta, null, 2),
    );
  }

  private readSessionMeta(sessionId: string): GondolinSessionMeta | null {
    const path = this.getSessionMetaPath(sessionId);
    if (!existsSync(path)) {
      return null;
    }

    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as GondolinSessionMeta;
    } catch {
      return null;
    }
  }

  private writeGitConfigForSession(
    sessionId: string,
    githubToken?: string,
  ): void {
    const gitDir = join(this.getSessionDataPath(sessionId), "git");
    this.setupGitConfig(gitDir, githubToken);
  }

  private setupGitConfig(gitDir: string, githubToken?: string): void {
    mkdirSync(gitDir, { recursive: true });

    const helperScript = githubToken
      ? `#!/bin/sh\necho "protocol=https\nhost=github.com\nusername=x-access-token\npassword=${githubToken}"\n`
      : "#!/bin/sh\n";
    const helperPath = join(gitDir, "git-credential-helper");
    writeFileSync(helperPath, helperScript, { mode: 0o700 });

    const lines = [
      "[user]",
      '\tname = "pi-sandbox"',
      '\temail = "pi-sandbox@noreply.github.com"',
    ];
    if (githubToken) {
      lines.push("[credential]", "\thelper = /git/git-credential-helper");
    }
    writeFileSync(join(gitDir, "gitconfig"), `${lines.join("\n")}\n`);
  }

  private async cloneRepoIntoDir(
    workspaceDir: string,
    repoUrl: string,
    branch?: string,
    githubToken?: string,
  ): Promise<void> {
    const effectiveUrl =
      githubToken && repoUrl.startsWith("https://github.com/")
        ? repoUrl.replace(
            "https://github.com/",
            `https://x-access-token:${githubToken}@github.com/`,
          )
        : repoUrl;

    const args = ["clone"];
    if (branch) {
      args.push("--branch", branch);
    }
    args.push(effectiveUrl, workspaceDir);

    const cloneResult = await runCommand("git", args, process.cwd());
    if (cloneResult.exitCode !== 0) {
      const detail = cloneResult.stderr || cloneResult.stdout;
      throw new Error(
        `Failed to clone repo: ${detail || `exit code ${cloneResult.exitCode}`}`,
      );
    }

    if (effectiveUrl !== repoUrl) {
      const resetResult = await runCommand(
        "git",
        ["-C", workspaceDir, "remote", "set-url", "origin", repoUrl],
        process.cwd(),
      );
      if (resetResult.exitCode !== 0) {
        const detail = resetResult.stderr || resetResult.stdout;
        throw new Error(
          `Failed to reset git remote URL: ${detail || `exit code ${resetResult.exitCode}`}`,
        );
      }
    }
  }

  private async resolveImagePath(): Promise<string> {
    if (this.resolvedImagePathPromise) {
      return this.resolvedImagePathPromise;
    }

    this.resolvedImagePathPromise = (async () => {
      const configuredPath = this.config.imagePath
        ? resolve(this.config.imagePath)
        : undefined;

      if (configuredPath) {
        if (!hasAssets(configuredPath)) {
          throw new Error(
            `Gondolin imagePath missing required assets: ${configuredPath}`,
          );
        }
        return configuredPath;
      }

      const imageOut = getDefaultImageOutPath();
      if (hasAssets(imageOut)) {
        return imageOut;
      }

      await this.generateImageAssets(imageOut);
      if (!hasAssets(imageOut)) {
        throw new Error(
          `Gondolin assets missing after conversion: ${imageOut}`,
        );
      }

      return imageOut;
    })();

    return this.resolvedImagePathPromise;
  }

  private async generateImageAssets(imageOut: string): Promise<void> {
    const docker2vmDir = getDocker2VmDir();
    const sourceImage =
      process.env.GONDOLIN_SOURCE_IMAGE ?? DEFAULT_SOURCE_IMAGE;

    mkdirSync(getCacheRoot(), { recursive: true });
    mkdirSync(imageOut, { recursive: true });

    try {
      await runCommand("bun", ["--version"], process.cwd());
    } catch {
      throw new Error(
        "Gondolin asset generation requires bun. Install bun or set config.imagePath to prebuilt assets.",
      );
    }

    if (!existsSync(docker2vmDir)) {
      const clone = await runCommand(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "https://github.com/vmg-dev/docker2vm.git",
          docker2vmDir,
        ],
        process.cwd(),
      );
      if (clone.exitCode !== 0) {
        const detail = clone.stderr || clone.stdout;
        throw new Error(
          `Failed to clone docker2vm: ${detail || "unknown error"}`,
        );
      }
    }

    const install = await runCommand("bun", ["install"], docker2vmDir);
    if (install.exitCode !== 0) {
      const detail = install.stderr || install.stdout;
      throw new Error(
        `docker2vm bun install failed: ${detail || "unknown error"}`,
      );
    }

    const convert = await runCommand(
      "bun",
      [
        "run",
        "oci2gondolin",
        "--",
        "--image",
        sourceImage,
        "--platform",
        "linux/arm64",
        "--mode",
        "assets",
        "--out",
        imageOut,
      ],
      docker2vmDir,
    );

    if (convert.exitCode !== 0) {
      const detail = convert.stderr || convert.stdout;
      throw new Error(
        `docker2vm conversion failed for ${sourceImage}: ${detail || "unknown error"}`,
      );
    }
  }

  private async createVm(options: {
    sessionId: string;
    sessionDir?: string;
    secrets?: Record<string, string>;
    nativeToolsEnabled?: boolean;
    tier?: SandboxResourceTier;
    imagePath?: string;
  }): Promise<VM> {
    const sessionDir =
      options.sessionDir ?? this.getSessionDataPath(options.sessionId);
    const workspaceDir = join(sessionDir, "workspace");
    const agentDir = join(sessionDir, "agent");
    const gitDir = join(sessionDir, "git");

    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(join(agentDir, "data"), { recursive: true });
    mkdirSync(join(agentDir, "config"), { recursive: true });
    mkdirSync(join(agentDir, "cache"), { recursive: true });
    mkdirSync(join(agentDir, "state"), { recursive: true });
    mkdirSync(gitDir, { recursive: true });

    const tier = options.tier ?? DEFAULT_TIER;
    const vmSpec = RESOURCE_TIER_SPECS[tier];
    const imagePath = options.imagePath
      ? resolve(options.imagePath)
      : await this.resolveImagePath();

    if (!hasAssets(imagePath)) {
      throw new Error(`Gondolin image assets not found: ${imagePath}`);
    }

    const env: Record<string, string> = {
      PI_SESSION_ID: options.sessionId,
      PI_CODING_AGENT_DIR: "/agent",
      GIT_CONFIG_GLOBAL: "/git/gitconfig",
      XDG_DATA_HOME: "/agent/data",
      XDG_CONFIG_HOME: "/agent/config",
      XDG_CACHE_HOME: "/agent/cache",
      XDG_STATE_HOME: "/agent/state",
    };

    for (const [key, value] of Object.entries(options.secrets ?? {})) {
      env[key] = value;
    }
    ensureModelEnvFallback(env);

    const vm = await GondolinVM.create({
      sandbox: {
        imagePath,
      },
      memory: vmSpec.memory,
      cpus: vmSpec.cpus,
      vfs: {
        mounts: {
          "/workspace": new RealFSProvider(workspaceDir),
          "/agent": new RealFSProvider(agentDir),
          "/git": new RealFSProvider(gitDir),
        },
      },
      env,
    });

    const probe = await vm.exec("pi --version", {
      signal: AbortSignal.timeout(20_000),
    });

    if (probe.exitCode !== 0) {
      await vm.close().catch(() => undefined);
      throw new Error(
        `Gondolin VM pi probe failed: ${probe.stderr || probe.stdout || `exit ${probe.exitCode}`}`,
      );
    }

    return vm;
  }
}

type HandleConfig = {
  sessionId: string;
  vm: VM | null;
  imagePath?: string;
  sessionDir: string;
  nativeToolsEnabled: boolean;
  resourceTier: SandboxResourceTier;
  initialStatus: SandboxStatus;
};

type HandleDeps = {
  createVm: (options: {
    sessionId: string;
    sessionDir?: string;
    secrets?: Record<string, string>;
    nativeToolsEnabled?: boolean;
    tier?: SandboxResourceTier;
    imagePath?: string;
  }) => Promise<VM>;
  writeGitConfig: (sessionId: string, githubToken?: string) => void;
  logStore: SandboxLogStore | null;
};

class GondolinSandboxHandle implements SandboxHandle {
  private _status: SandboxStatus;
  private statusListeners = new Set<(status: SandboxStatus) => void>();
  private currentChannel: GondolinSandboxChannel | null = null;
  private vm: VM | null;
  private secrets: Record<string, string> = {};
  private config: HandleConfig;

  constructor(
    config: HandleConfig,
    private deps: HandleDeps,
  ) {
    this.config = config;
    this.vm = config.vm;
    this._status = config.initialStatus;
  }

  get sessionId(): string {
    return this.config.sessionId;
  }

  get providerId(): string {
    return `gondolin-${this.config.sessionId}`;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  get imageDigest(): string {
    return this.config.imagePath ?? "gondolin";
  }

  async resume(
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Promise<void> {
    if (secrets) {
      this.secrets = { ...secrets };
    }

    this.deps.writeGitConfig(this.sessionId, githubToken);

    if (this._status === "running") {
      return;
    }

    if (this._status === "error") {
      throw new Error(
        `Cannot resume: sandbox ${this.sessionId} is in error state`,
      );
    }

    this.vm = await this.deps.createVm({
      sessionId: this.sessionId,
      sessionDir: this.config.sessionDir,
      secrets: this.secrets,
      nativeToolsEnabled: this.config.nativeToolsEnabled,
      tier: this.config.resourceTier,
      imagePath: this.config.imagePath,
    });
    this.setStatus("running");
  }

  async attach(): Promise<SandboxChannel> {
    if (this._status !== "running") {
      throw new Error(
        `Cannot attach to sandbox in "${this._status}" status (must be "running")`,
      );
    }

    if (!this.vm) {
      throw new Error("Cannot attach: Gondolin VM is not initialized");
    }

    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    if (this.config.nativeToolsEnabled) {
      const extensionProbe = await this.vm.exec(
        "test -f /run/extensions/native-bridge.ts",
      );
      if (extensionProbe.exitCode !== 0) {
        throw new Error(
          "nativeToolsEnabled is true but /run/extensions/native-bridge.ts is not present in Gondolin image",
        );
      }
    }

    const env: Record<string, string> = {
      PI_SESSION_ID: this.sessionId,
      PI_CODING_AGENT_DIR: "/agent",
      GIT_CONFIG_GLOBAL: "/git/gitconfig",
      XDG_DATA_HOME: "/agent/data",
      XDG_CONFIG_HOME: "/agent/config",
      XDG_CACHE_HOME: "/agent/cache",
      XDG_STATE_HOME: "/agent/state",
    };
    for (const [key, value] of Object.entries(this.secrets)) {
      env[key] = value;
    }
    ensureModelEnvFallback(env);

    const cmd = this.config.nativeToolsEnabled
      ? "pi --mode rpc -e /run/extensions/native-bridge.ts"
      : "pi --mode rpc";

    const proc = this.vm.exec(cmd, {
      cwd: "/workspace",
      stdin: true,
      env,
      buffer: false,
    });

    const channel = new GondolinSandboxChannel(
      proc,
      this.sessionId,
      this.deps.logStore ?? undefined,
    );
    this.currentChannel = channel;

    channel.onClose(() => {
      if (this.currentChannel === channel) {
        this.currentChannel = null;
      }
    });

    return channel;
  }

  async pause(): Promise<void> {
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    if (this.vm) {
      await this.vm.close().catch(() => undefined);
      this.vm = null;
    }

    this.setStatus("paused");
  }

  async terminate(): Promise<void> {
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    if (this.vm) {
      await this.vm.close().catch(() => undefined);
      this.vm = null;
    }

    this.setStatus("stopped");
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private setStatus(status: SandboxStatus): void {
    if (this._status === status) {
      return;
    }
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

class GondolinSandboxChannel implements SandboxChannel {
  private closed = false;
  private messageHandlers = new Set<(message: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();
  private stdoutRl: readline.Interface;
  private stderrRl: readline.Interface;

  constructor(
    private proc: ExecProcess,
    private sessionId?: string,
    private logStore?: SandboxLogStore,
  ) {
    this.stdoutRl = readline.createInterface({ input: this.proc.stdout });
    this.stderrRl = readline.createInterface({ input: this.proc.stderr });

    this.stdoutRl.on("line", (line) => {
      if (this.closed) return;
      for (const handler of this.messageHandlers) {
        handler(line);
      }
    });

    this.stderrRl.on("line", (line) => {
      if (this.closed || !line.trim()) return;
      console.error(`[sandbox:gondolin:stderr] ${line}`);
      if (this.sessionId && this.logStore) {
        this.logStore.append(this.sessionId, line);
      }
    });

    this.proc.result
      .then(() => {
        if (this.closed) return;
        this.notifyClose("pi process exited");
      })
      .catch((err) => {
        if (this.closed) return;
        const reason = err instanceof Error ? err.message : "pi process failed";
        this.notifyClose(reason);
      });
  }

  send(message: string): void {
    if (this.closed) return;
    this.proc.write(`${message}\n`);
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
    try {
      this.proc.end();
    } catch {
      // noop
    }
    this.stdoutRl.close();
    this.stderrRl.close();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  private notifyClose(reason?: string): void {
    this.closed = true;
    this.stdoutRl.close();
    this.stderrRl.close();
    for (const handler of this.closeHandlers) {
      handler(reason);
    }
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      resolveResult({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}
