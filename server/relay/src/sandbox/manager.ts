import { createLogger } from "../lib/logger";
import type { EnvironmentRecord } from "../services/environment.service";
import type { SecretsService } from "../services/secrets.service";
import { CloudflareSandboxProvider } from "./cloudflare";
import { DockerSandboxProvider } from "./docker";
import { GondolinSandboxProvider } from "./gondolin";
import { LocalSandboxProvider } from "./local";
import type { SandboxLogStore } from "./log-store";
import { MockSandboxProvider } from "./mock";
import type { SandboxProviderType } from "./provider-types";

export type { SandboxProviderType };

import type { PiDetectionResult } from "./local/detect-pi";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxChannel,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxSecretMaterial,
} from "./types";

const log = createLogger("sandbox");

export interface EnvironmentSandboxConfig {
  sandboxType: "docker" | "cloudflare" | "gondolin" | "local";
  image?: string;
  workerUrl?: string;
  apiToken?: string;
  imagePath?: string;
  env?: Record<string, string>;
  workspaceMode?: "github-clone" | "local-directory" | "git-worktree";
  repoUrl?: string;
  repoBranch?: string;
  localPath?: string;
  worktreeRepoPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  systemManaged?: boolean;
}

export interface SandboxManagerConfig {
  docker: {
    sessionDataDir: string;
    secretsBaseDir: string;
  };
  gondolin: {
    sessionDataDir: string;
  };
  local: {
    sessionDataDir: string;
  };
  logStore?: SandboxLogStore;
}

export class SandboxManager {
  private config: SandboxManagerConfig;
  private providerCache = new Map<string, SandboxProvider>();
  private mockProvider: MockSandboxProvider | null = null;
  private activeValidationAbort: AbortController | null = null;
  private secretsService: SecretsService;

  constructor(config: SandboxManagerConfig, secretsService: SecretsService) {
    this.config = config;
    this.secretsService = secretsService;
  }

  private getProvider(envConfig: EnvironmentSandboxConfig): SandboxProvider {
    if (envConfig.sandboxType === "docker") {
      const image = envConfig.image ?? "pi-sandbox:local";
      const cacheKey = `docker:${image}`;
      let provider = this.providerCache.get(cacheKey);
      if (!provider) {
        provider = new DockerSandboxProvider(
          {
            image,
            sessionDataDir: this.config.docker.sessionDataDir,
            secretsBaseDir: this.config.docker.secretsBaseDir,
          },
          this.config.logStore,
        );
        this.providerCache.set(cacheKey, provider);
      }
      return provider;
    }

    if (envConfig.sandboxType === "cloudflare") {
      const { workerUrl, apiToken } = envConfig;
      if (!workerUrl)
        throw new Error("Cloudflare environment missing workerUrl in config");
      if (!apiToken) {
        throw new Error(
          "Cloudflare environment missing apiToken in config. Set it in the environment settings.",
        );
      }
      const cacheKey = `cloudflare:${workerUrl}`;
      const provider = new CloudflareSandboxProvider({ workerUrl, apiToken });
      this.providerCache.set(cacheKey, provider);
      return provider;
    }

    if (envConfig.sandboxType === "gondolin") {
      const imagePath = envConfig.imagePath;
      const cacheKey = `gondolin:${imagePath ?? "default"}`;
      let provider = this.providerCache.get(cacheKey);
      if (!provider) {
        provider = new GondolinSandboxProvider(
          {
            sessionDataDir: this.config.gondolin.sessionDataDir,
            imagePath,
          },
          this.config.logStore,
        );
        this.providerCache.set(cacheKey, provider);
      }
      return provider;
    }

    if (envConfig.sandboxType === "local") {
      return new LocalSandboxProvider(
        {
          sessionDataDir: this.config.local.sessionDataDir,
          envConfig,
        },
        this.config.logStore,
      );
    }

    throw new Error(`Unknown sandbox type: ${envConfig.sandboxType}`);
  }

  getMockProvider(): MockSandboxProvider {
    if (!this.mockProvider) {
      this.mockProvider = new MockSandboxProvider();
    }
    return this.mockProvider;
  }

  async isProviderAvailable(
    envConfig: EnvironmentSandboxConfig,
  ): Promise<boolean> {
    try {
      const provider = this.getProvider(envConfig);
      return provider.isAvailable();
    } catch {
      return false;
    }
  }

  async getLocalProviderStatus(): Promise<PiDetectionResult> {
    const provider = this.getProvider({
      sandboxType: "local",
      workspaceMode: "local-directory",
      localPath: process.cwd(),
    });
    if (!(provider instanceof LocalSandboxProvider)) {
      return { available: false, error: "Local provider unavailable" };
    }
    return provider.getStatus();
  }

  async validateExtensionPackage(
    source: string,
    options?: { ignoreScripts?: boolean },
  ): Promise<{ valid: boolean; error?: string } | null> {
    if (this.activeValidationAbort) {
      return { valid: false, error: "validation already in progress" };
    }

    try {
      const provider = this.getGondolinProvider();
      if (!provider) return null;
      const available = await provider.isAvailable();
      if (!available) return null;

      const abortController = new AbortController();
      this.activeValidationAbort = abortController;
      return await provider.validatePackage(source, {
        signal: abortController.signal,
        ignoreScripts: options?.ignoreScripts,
      });
    } catch {
      return null;
    } finally {
      this.activeValidationAbort = null;
    }
  }

  cancelExtensionValidation(): boolean {
    if (!this.activeValidationAbort) return false;
    this.activeValidationAbort.abort();
    this.activeValidationAbort = null;
    return true;
  }

  private getGondolinProvider(): GondolinSandboxProvider | null {
    const cacheKey = "gondolin:default";
    let provider = this.providerCache.get(cacheKey);
    if (!provider) {
      provider = new GondolinSandboxProvider(
        { sessionDataDir: this.config.gondolin.sessionDataDir },
        this.config.logStore,
      );
      this.providerCache.set(cacheKey, provider);
    }
    return provider as GondolinSandboxProvider;
  }

  async resolveSecretMaterial(
    providerType: "docker" | "cloudflare" | "gondolin" | "mock" | "local",
  ): Promise<SandboxSecretMaterial> {
    const material = await this.secretsService.getSecretMaterial(providerType);
    return {
      directEnv: material.directEnv,
      gondolinHookSecrets:
        material.gondolinHookSecrets.length > 0
          ? material.gondolinHookSecrets
          : undefined,
    };
  }

  async createForSession(
    sessionId: string,
    envConfig: EnvironmentSandboxConfig,
    options?: Omit<
      CreateSandboxOptions,
      "sessionId" | "secrets" | "secretMaterial"
    >,
  ): Promise<SandboxHandle> {
    const provider = this.getProvider(envConfig);
    const material = await this.resolveSecretMaterial(
      envConfig.sandboxType as
        | "docker"
        | "cloudflare"
        | "gondolin"
        | "mock"
        | "local",
    );
    const mergedEnv = { ...(envConfig.env ?? {}), ...(options?.env ?? {}) };
    const mergedDirectEnv = { ...material.directEnv, ...mergedEnv };
    return provider.createSandbox({
      sessionId,
      ...options,
      env: mergedEnv,
      secrets: mergedDirectEnv,
      secretMaterial: { ...material, directEnv: mergedDirectEnv },
    });
  }

  async createMockForSession(
    sessionId: string,
    options?: Omit<
      CreateSandboxOptions,
      "sessionId" | "secrets" | "secretMaterial"
    >,
  ): Promise<SandboxHandle> {
    const provider = this.getMockProvider();
    const material = await this.resolveSecretMaterial("mock");
    return provider.createSandbox({
      sessionId,
      ...options,
      secrets: material.directEnv,
    });
  }

  async getHandle(
    envConfig: EnvironmentSandboxConfig,
    providerId: string,
  ): Promise<SandboxHandle> {
    const provider = this.getProvider(envConfig);
    return provider.getSandbox(providerId);
  }

  async getHandleByType(
    providerType: SandboxProviderType,
    providerId: string,
    envConfig?: EnvironmentSandboxConfig,
  ): Promise<SandboxHandle> {
    if (providerType === "mock") {
      return this.getMockProvider().getSandbox(providerId);
    }
    if (!envConfig) {
      throw new Error(
        `Environment config required for provider type "${providerType}"`,
      );
    }
    return this.getHandle(envConfig, providerId);
  }

  async resumeSession(
    providerType: SandboxProviderType,
    providerId: string,
    envConfig?: EnvironmentSandboxConfig,
    githubToken?: string,
  ): Promise<SandboxHandle> {
    const handle = await this.getHandleByType(
      providerType,
      providerId,
      envConfig,
    );
    const material = await this.resolveSecretMaterial(
      providerType as "docker" | "cloudflare" | "gondolin" | "mock" | "local",
    );
    const mergedDirectEnv = {
      ...material.directEnv,
      ...(envConfig?.env ?? {}),
    };
    await handle.resume(mergedDirectEnv, githubToken, {
      ...material,
      directEnv: mergedDirectEnv,
    });
    return handle;
  }

  async attachSession(
    providerType: SandboxProviderType,
    providerId: string,
    envConfig?: EnvironmentSandboxConfig,
  ): Promise<{ handle: SandboxHandle; channel: SandboxChannel }> {
    const handle = await this.getHandleByType(
      providerType,
      providerId,
      envConfig,
    );
    const channel = await handle.attach();
    return { handle, channel };
  }

  async terminateByProviderId(
    providerType: SandboxProviderType,
    providerId: string,
    envConfig?: EnvironmentSandboxConfig,
  ): Promise<void> {
    try {
      const handle = await this.getHandleByType(
        providerType,
        providerId,
        envConfig,
      );
      await handle.terminate();
    } catch (err) {
      log.error({ err, providerId }, "terminate failed (may already be gone)");
    }
  }

  async listAll(): Promise<
    (SandboxInfo & { provider: SandboxProviderType })[]
  > {
    const results: (SandboxInfo & { provider: SandboxProviderType })[] = [];
    for (const [key, provider] of this.providerCache) {
      const type = key.split(":")[0] as SandboxProviderType;
      const sandboxes = await provider.listSandboxes();
      for (const sandbox of sandboxes) {
        results.push({ ...sandbox, provider: type });
      }
    }
    if (this.mockProvider) {
      const sandboxes = await this.mockProvider.listSandboxes();
      for (const sandbox of sandboxes) {
        results.push({ ...sandbox, provider: "mock" });
      }
    }
    return results;
  }

  async cleanup(): Promise<CleanupResult> {
    let sandboxesRemoved = 0;
    let artifactsRemoved = 0;
    for (const provider of this.providerCache.values()) {
      const result = await provider.cleanup();
      sandboxesRemoved += result.sandboxesRemoved;
      artifactsRemoved += result.artifactsRemoved;
    }
    if (this.mockProvider) {
      const result = await this.mockProvider.cleanup();
      sandboxesRemoved += result.sandboxesRemoved;
      artifactsRemoved += result.artifactsRemoved;
    }
    return { sandboxesRemoved, artifactsRemoved };
  }
}

export async function resolveEnvConfig(
  env: EnvironmentRecord,
  secretsService: SecretsService,
): Promise<EnvironmentSandboxConfig> {
  const config = JSON.parse(env.config) as {
    image?: string;
    workerUrl?: string;
    secretId?: string;
    imagePath?: string;
    envVars?: Array<{ key: string; value: string }>;
    workspaceMode?: "github-clone" | "local-directory" | "git-worktree";
    repoUrl?: string;
    repoBranch?: string;
    localPath?: string;
    worktreeRepoPath?: string;
    worktreePath?: string;
    worktreeBranch?: string;
    systemManaged?: boolean;
  };

  const result: EnvironmentSandboxConfig = {
    sandboxType: env.sandboxType as
      | "docker"
      | "cloudflare"
      | "gondolin"
      | "local",
    image: config.image,
    workerUrl: config.workerUrl,
    imagePath: config.imagePath,
    workspaceMode: config.workspaceMode,
    repoUrl: config.repoUrl,
    repoBranch: config.repoBranch,
    localPath: config.localPath,
    worktreeRepoPath: config.worktreeRepoPath,
    worktreePath: config.worktreePath,
    worktreeBranch: config.worktreeBranch,
    systemManaged: config.systemManaged,
    env:
      config.envVars && config.envVars.length > 0
        ? Object.fromEntries(
            config.envVars.map((entry) => [entry.key, entry.value]),
          )
        : undefined,
  };

  if (env.sandboxType === "cloudflare" && config.secretId) {
    const apiToken = await secretsService.getValue(config.secretId);
    if (apiToken) {
      result.apiToken = apiToken;
    }
  }

  return result;
}
