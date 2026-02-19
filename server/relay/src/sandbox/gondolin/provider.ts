import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  VM as GondolinVM,
  RealFSProvider,
  type VM,
} from "@earendil-works/gondolin";
import { createLogger } from "../../lib/logger";
import type { SandboxLogStore } from "../log-store";
import type { SandboxResourceTier } from "../provider-types";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxChannel,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxProviderCapabilities,
  SandboxStatus,
} from "../types";
import { GondolinSandboxChannel } from "./channel";
import { buildSandboxEnv, buildValidationEnv } from "./env";
import { runCommand } from "./host-command";
import { ensureAgentDirs, getSessionPaths, hasAssets } from "./paths";
import { buildValidationInstallCommand } from "./validation-command";

const DEFAULT_TIER: SandboxResourceTier = "medium";

const RESOURCE_TIER_SPECS: Record<
  SandboxResourceTier,
  { memory: string; cpus: number }
> = {
  small: { memory: "1024M", cpus: 1 },
  medium: { memory: "2048M", cpus: 2 },
  large: { memory: "4096M", cpus: 4 },
};

const VALIDATION_TIMEOUT_MS = 300_000;
const PI_PROBE_TIMEOUT_MS = 60_000;
const NPM_PROBE_TIMEOUT_MS = 30_000;

const logger = createLogger("gondolin");

function getCacheRoot(): string {
  if (process.env.PI_RELAY_CACHE_DIR) {
    return process.env.PI_RELAY_CACHE_DIR;
  }
  return join(process.cwd(), ".dev", "relay", "cache");
}

function getDefaultImageOutPath(): string {
  return process.env.GONDOLIN_IMAGE_OUT
    ? resolve(process.env.GONDOLIN_IMAGE_OUT)
    : join(getCacheRoot(), "gondolin-custom", "pi-runtime-main");
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
        signal: AbortSignal.timeout(PI_PROBE_TIMEOUT_MS),
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

  /**
   * Validate a package source by spinning up an ephemeral VM and running
   * `pi install <source>`. Returns { valid, error? }.
   */
  async validatePackage(
    source: string,
    options?: { signal?: AbortSignal; ignoreScripts?: boolean },
  ): Promise<{ valid: boolean; error?: string }> {
    const packageSource = source.trim();
    if (!packageSource) {
      return { valid: false, error: "package source is required" };
    }

    let vm: VM | null = null;
    let validateDir: string | null = null;

    try {
      const imagePath = await this.resolveImagePath();

      const validateRoot = join(getCacheRoot(), "gondolin-validate");
      mkdirSync(validateRoot, { recursive: true });
      validateDir = mkdtempSync(join(validateRoot, "pkg-"));
      ensureAgentDirs(validateDir);

      vm = await GondolinVM.create({
        sandbox: { imagePath, netEnabled: true },
        vfs: {
          mounts: {
            "/agent": new RealFSProvider(validateDir),
          },
        },
        env: buildValidationEnv({ ignoreScripts: options?.ignoreScripts }),
      });

      if (options?.signal) {
        options.signal.addEventListener(
          "abort",
          () => {
            vm?.close().catch(() => undefined);
          },
          { once: true },
        );
      }

      await this.ensureWorkingNpm(vm);

      const timeoutSignal = AbortSignal.timeout(VALIDATION_TIMEOUT_MS);
      const combinedSignal = options?.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;

      const proc = vm.exec(buildValidationInstallCommand(packageSource), {
        signal: combinedSignal,
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      for await (const chunk of proc.output()) {
        if (chunk.stream === "stdout") {
          stdoutChunks.push(chunk.text);
        } else {
          stderrChunks.push(chunk.text);
        }
      }

      const result = await proc;

      if (result.exitCode === 0) {
        return { valid: true };
      }

      const detail =
        result.stderr?.trim() ||
        stderrChunks.join("").trim() ||
        result.stdout?.trim() ||
        stdoutChunks.join("").trim() ||
        "unknown error";
      return { valid: false, error: detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : "validation failed";
      const canceled =
        options?.signal?.aborted ||
        message.includes("aborted") ||
        message.includes("AbortError");
      if (canceled) {
        return { valid: false, error: "validation canceled" };
      }
      return {
        valid: false,
        error: message,
      };
    } finally {
      if (vm) {
        await vm.close().catch(() => undefined);
      }
      if (validateDir) {
        rmSync(validateDir, { recursive: true, force: true });
      }
    }
  }

  private async ensureWorkingNpm(vm: VM): Promise<void> {
    const startedAt = Date.now();
    const probe = await vm.exec(
      "test -f /usr/lib/node_modules/npm/node_modules/@sigstore/protobuf-specs/dist/__generated__/google/protobuf/timestamp.js",
      { signal: AbortSignal.timeout(NPM_PROBE_TIMEOUT_MS) },
    );
    logger.debug(
      `ensureWorkingNpm probe elapsedMs=${Date.now() - startedAt} exitCode=${probe.exitCode}`,
    );
    if (probe.exitCode === 0) {
      return;
    }

    // temporary disabled: custom Gondolin image should already include working npm
    // const fix = await vm.exec("apk add --no-cache npm", {
    //   signal: AbortSignal.timeout(120_000),
    // });
    // if (fix.exitCode !== 0) {
    //   throw new Error(
    //     fix.stderr?.trim() || fix.stdout?.trim() || "failed to install npm",
    //   );
    // }

    logger.debug("ensureWorkingNpm failed (auto-fix disabled)");
    throw new Error(
      "npm is missing or broken in Gondolin image (auto-fix disabled)",
    );
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

      throw new Error(
        `Gondolin assets missing: ${imageOut}. Build them with server/sandboxes/gondolin/scripts/setup-custom-assets.sh and set GONDOLIN_IMAGE_OUT if needed.`,
      );
    })();

    return this.resolvedImagePathPromise;
  }

  private async createVm(options: {
    sessionId: string;
    sessionDir?: string;
    secrets?: Record<string, string>;
    nativeToolsEnabled?: boolean;
    tier?: SandboxResourceTier;
    imagePath?: string;
  }): Promise<VM> {
    const startedAt = Date.now();
    logger.debug(`createVm start session=${options.sessionId}`);

    const sessionDir =
      options.sessionDir ?? this.getSessionDataPath(options.sessionId);
    const { workspaceDir, agentDir, gitDir } = getSessionPaths(sessionDir);

    mkdirSync(workspaceDir, { recursive: true });
    ensureAgentDirs(agentDir);
    mkdirSync(gitDir, { recursive: true });

    const tier = options.tier ?? DEFAULT_TIER;
    const vmSpec = RESOURCE_TIER_SPECS[tier];
    const imagePath = options.imagePath
      ? resolve(options.imagePath)
      : await this.resolveImagePath();

    if (!hasAssets(imagePath)) {
      throw new Error(`Gondolin image assets not found: ${imagePath}`);
    }

    const env = buildSandboxEnv({
      sessionId: options.sessionId,
      secrets: options.secrets,
    });

    const createStartedAt = Date.now();
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
    logger.debug(
      `createVm vm.create done session=${options.sessionId} elapsedMs=${Date.now() - createStartedAt}`,
    );

    const npmStartedAt = Date.now();
    await this.ensureWorkingNpm(vm);
    logger.debug(
      `createVm npm-check done session=${options.sessionId} elapsedMs=${Date.now() - npmStartedAt}`,
    );

    logger.debug(
      `createVm done session=${options.sessionId} elapsedMs=${Date.now() - startedAt}`,
    );
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

    const env = buildSandboxEnv({
      sessionId: this.sessionId,
      secrets: this.secrets,
    });

    const cmd = this.config.nativeToolsEnabled
      ? "/usr/local/bin/pi --mode rpc -e /run/extensions/native-bridge.ts"
      : "/usr/local/bin/pi --mode rpc";

    logger.debug(
      { sessionId: this.sessionId, cmd, envKeys: Object.keys(env) },
      "attach: launching pi",
    );

    const proc = this.vm.exec(cmd, {
      cwd: "/workspace",
      stdin: true,
      env,
      stdout: "pipe",
      stderr: "pipe",
      buffer: false,
    });

    logger.debug(
      {
        sessionId: this.sessionId,
        hasStdout: !!proc.stdout,
        hasStderr: !!proc.stderr,
      },
      "attach: proc created",
    );

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
