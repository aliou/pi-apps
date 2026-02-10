import type { EnvironmentRecord } from "../services/environment.service";
import type { SecretsService } from "../services/secrets.service";
import { CloudflareSandboxProvider } from "./cloudflare";
import { DockerSandboxProvider } from "./docker";
import { MockSandboxProvider } from "./mock";
import type { SandboxProviderType } from "./provider-types";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxChannel,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
} from "./types";

/**
 * Per-environment sandbox config as stored in the environments table.
 * The manager uses this to build provider instances on-demand.
 */
/**
 * Per-environment sandbox config resolved at runtime.
 * Callers resolve secrets before passing this to the manager.
 */
export interface EnvironmentSandboxConfig {
  sandboxType: "docker" | "cloudflare";
  /** Docker image name (for docker type) */
  image?: string;
  /** Cloudflare Worker URL (for cloudflare type) */
  workerUrl?: string;
  /** Decrypted shared secret for Worker auth (for cloudflare type) */
  apiToken?: string;
}

export interface SandboxManagerConfig {
  /**
   * Base Docker config (host paths, etc). Provider instances are built
   * on-demand with per-environment image overrides.
   */
  docker: {
    sessionDataDir: string;
    secretsBaseDir: string;
  };
}

/**
 * Manages sandbox lifecycle with support for multiple providers.
 * Builds provider instances on-demand from per-environment config
 * rather than creating them once at boot.
 *
 * Stateless -- does not track sessions in memory.
 * The DB is the source of truth for session -> provider/providerId mappings.
 */
export class SandboxManager {
  private config: SandboxManagerConfig;
  /** Cached provider instances keyed by a config fingerprint. */
  private providerCache = new Map<string, SandboxProvider>();
  /** Mock provider singleton (for tests only). */
  private mockProvider: MockSandboxProvider | null = null;
  /** Cached secrets snapshot for new sandbox creation. */
  private secretsSnapshot: Record<string, string> = {};

  constructor(config: SandboxManagerConfig) {
    this.config = config;
  }

  /**
   * Get or create a provider instance for a given environment config.
   * Docker providers are keyed by image name.
   * Cloudflare providers are keyed by workerUrl.
   * Mock provider is a singleton.
   */
  private getProvider(envConfig: EnvironmentSandboxConfig): SandboxProvider {
    if (envConfig.sandboxType === "docker") {
      const image = envConfig.image ?? "pi-sandbox:local";
      const cacheKey = `docker:${image}`;

      let provider = this.providerCache.get(cacheKey);
      if (!provider) {
        provider = new DockerSandboxProvider({
          image,
          sessionDataDir: this.config.docker.sessionDataDir,
          secretsBaseDir: this.config.docker.secretsBaseDir,
        });
        this.providerCache.set(cacheKey, provider);
      }
      return provider;
    }

    if (envConfig.sandboxType === "cloudflare") {
      const { workerUrl, apiToken } = envConfig;
      if (!workerUrl) {
        throw new Error("Cloudflare environment missing workerUrl in config");
      }
      if (!apiToken) {
        throw new Error(
          "Cloudflare environment missing apiToken in config. Set it in the environment settings.",
        );
      }

      const cacheKey = `cloudflare:${workerUrl}`;

      // Always rebuild -- token may have changed.
      const provider = new CloudflareSandboxProvider({ workerUrl, apiToken });
      this.providerCache.set(cacheKey, provider);
      return provider;
    }

    throw new Error(`Unknown sandbox type: ${envConfig.sandboxType}`);
  }

  /**
   * Get the mock provider (for tests/dev). Not exposed in UI.
   */
  getMockProvider(): MockSandboxProvider {
    if (!this.mockProvider) {
      this.mockProvider = new MockSandboxProvider();
    }
    return this.mockProvider;
  }

  /**
   * Check if a provider type is available for a given config.
   */
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

  /**
   * Update the secrets snapshot used for new sandbox creations.
   * Does not affect already-running sandboxes.
   */
  setSecrets(secrets: Record<string, string>): void {
    this.secretsSnapshot = { ...secrets };
  }

  /**
   * Get the current secrets snapshot.
   */
  getSecrets(): Record<string, string> {
    return { ...this.secretsSnapshot };
  }

  /**
   * Create a sandbox for a session using environment config.
   * Returns the handle. Caller should persist handle.providerId to DB.
   */
  async createForSession(
    sessionId: string,
    envConfig: EnvironmentSandboxConfig,
    options?: Omit<CreateSandboxOptions, "sessionId">,
  ): Promise<SandboxHandle> {
    const provider = this.getProvider(envConfig);
    return provider.createSandbox({ sessionId, ...options });
  }

  /**
   * Create a sandbox using the mock provider (for tests/dev).
   */
  async createMockForSession(
    sessionId: string,
    options?: Omit<CreateSandboxOptions, "sessionId">,
  ): Promise<SandboxHandle> {
    const provider = this.getMockProvider();
    return provider.createSandbox({ sessionId, ...options });
  }

  /**
   * Get sandbox handle for a session by its provider-specific ID.
   * Needs environment config to resolve the correct provider instance.
   */
  async getHandle(
    envConfig: EnvironmentSandboxConfig,
    providerId: string,
  ): Promise<SandboxHandle> {
    const provider = this.getProvider(envConfig);
    return provider.getSandbox(providerId);
  }

  /**
   * Get handle using raw provider type + providerId.
   * Used when environment config is not available (e.g., mock sessions).
   * Falls back to mock provider for "mock" type.
   */
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

  /**
   * Resume a sandbox session: get handle and call resume().
   * Used by the activate endpoint.
   */
  async resumeSession(
    providerType: SandboxProviderType,
    providerId: string,
    envConfig?: EnvironmentSandboxConfig,
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Promise<SandboxHandle> {
    const handle = await this.getHandleByType(
      providerType,
      providerId,
      envConfig,
    );
    await handle.resume(secrets, githubToken);
    return handle;
  }

  /**
   * Attach to a sandbox: get handle + channel in one call.
   * Used by the WS handler.
   */
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

  /**
   * Terminate a sandbox by provider-specific ID.
   */
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
      console.error(`[sandbox] terminate failed for ${providerId} (may already be gone):`, err);
    }
  }

  /** List all active sandboxes across all cached providers */
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

  /** Cleanup stopped sandboxes across all cached providers */
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

/**
 * Resolve an environment DB record into an EnvironmentSandboxConfig.
 * For cloudflare environments, decrypts the referenced shared secret.
 */
export async function resolveEnvConfig(
  env: EnvironmentRecord,
  secretsService: SecretsService,
): Promise<EnvironmentSandboxConfig> {
  const config = JSON.parse(env.config) as {
    image?: string;
    workerUrl?: string;
    secretId?: string;
  };

  const result: EnvironmentSandboxConfig = {
    sandboxType: env.sandboxType as "docker" | "cloudflare",
    image: config.image,
    workerUrl: config.workerUrl,
  };

  if (env.sandboxType === "cloudflare" && config.secretId) {
    const apiToken = await secretsService.getValue(config.secretId);
    if (apiToken) {
      result.apiToken = apiToken;
    }
  }

  return result;
}
