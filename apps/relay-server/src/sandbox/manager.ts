import { type DockerProviderConfig, DockerSandboxProvider } from "./docker";
import { MockSandboxProvider } from "./mock";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxStreams,
} from "./types";

export type SandboxProviderType = "mock" | "docker";

export interface SandboxManagerConfig {
  /** Default provider for new sessions */
  defaultProvider: SandboxProviderType;
  /** Docker provider config (required if docker is enabled) */
  docker?: DockerProviderConfig;
  /** Which providers to enable (default: all) */
  enabledProviders?: SandboxProviderType[];
}

/**
 * Manages sandbox lifecycle with support for multiple providers.
 * Stateless — does not track sessions in memory.
 * The DB is the source of truth for session → provider/providerId mappings.
 */
export class SandboxManager {
  private providers = new Map<SandboxProviderType, SandboxProvider>();
  private defaultProvider: SandboxProviderType;

  constructor(config: SandboxManagerConfig) {
    this.defaultProvider = config.defaultProvider;

    const enabled = config.enabledProviders ?? ["mock", "docker"];

    if (enabled.includes("mock")) {
      this.providers.set("mock", new MockSandboxProvider());
    }
    if (enabled.includes("docker") && config.docker) {
      this.providers.set("docker", new DockerSandboxProvider(config.docker));
    }
  }

  get defaultProviderName(): SandboxProviderType {
    return this.defaultProvider;
  }

  /** List all enabled provider names */
  get enabledProviders(): SandboxProviderType[] {
    return Array.from(this.providers.keys());
  }

  /** Check if a specific provider is available */
  async isProviderAvailable(
    providerType?: SandboxProviderType,
  ): Promise<boolean> {
    const type = providerType ?? this.defaultProvider;
    const provider = this.providers.get(type);
    if (!provider) return false;
    return provider.isAvailable();
  }

  /** Check availability of all enabled providers */
  async getProviderStatus(): Promise<
    Record<SandboxProviderType, { enabled: boolean; available: boolean }>
  > {
    const status: Record<string, { enabled: boolean; available: boolean }> = {};

    for (const type of ["mock", "docker"] as SandboxProviderType[]) {
      const provider = this.providers.get(type);
      status[type] = {
        enabled: !!provider,
        available: provider ? await provider.isAvailable() : false,
      };
    }

    return status as Record<
      SandboxProviderType,
      { enabled: boolean; available: boolean }
    >;
  }

  /**
   * Create a sandbox for a session.
   * Returns the handle. Caller should persist handle.providerId to DB.
   */
  async createForSession(
    sessionId: string,
    options?: Omit<CreateSandboxOptions, "sessionId">,
    providerType?: SandboxProviderType,
  ): Promise<SandboxHandle> {
    const type = providerType ?? this.defaultProvider;
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Provider "${type}" is not enabled`);
    }

    return provider.createSandbox({ sessionId, ...options });
  }

  /**
   * Get sandbox handle for a session by its provider-specific ID.
   * Checks real provider state (e.g., Docker API).
   * Throws if sandbox doesn't exist.
   */
  async getHandle(
    providerType: SandboxProviderType,
    providerId: string,
  ): Promise<SandboxHandle> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      throw new Error(`Provider "${providerType}" is not enabled`);
    }

    return provider.getSandbox(providerId);
  }

  /**
   * Resume a sandbox session: get handle and call resume().
   * Used by the activate endpoint.
   */
  async resumeSession(
    providerType: SandboxProviderType,
    providerId: string,
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Promise<SandboxHandle> {
    const handle = await this.getHandle(providerType, providerId);
    await handle.resume(secrets, githubToken);
    return handle;
  }

  /**
   * Attach to a sandbox: get handle + streams in one call.
   * Used by the WS handler.
   */
  async attachSession(
    providerType: SandboxProviderType,
    providerId: string,
  ): Promise<{ handle: SandboxHandle; streams: SandboxStreams }> {
    const handle = await this.getHandle(providerType, providerId);
    const streams = await handle.attach();
    return { handle, streams };
  }

  /**
   * Terminate a sandbox by provider-specific ID.
   */
  async terminateByProviderId(
    providerType: SandboxProviderType,
    providerId: string,
  ): Promise<void> {
    try {
      const handle = await this.getHandle(providerType, providerId);
      await handle.terminate();
    } catch {
      // Sandbox already gone — that's fine
    }
  }

  /** List all active sandboxes across all providers */
  async listAll(): Promise<
    (SandboxInfo & { provider: SandboxProviderType })[]
  > {
    const results: (SandboxInfo & { provider: SandboxProviderType })[] = [];

    for (const [type, provider] of this.providers) {
      const sandboxes = await provider.listSandboxes();
      for (const sandbox of sandboxes) {
        results.push({ ...sandbox, provider: type });
      }
    }

    return results;
  }

  /** Cleanup stopped sandboxes across all providers */
  async cleanup(): Promise<CleanupResult> {
    let containersRemoved = 0;
    let volumesRemoved = 0;

    for (const provider of this.providers.values()) {
      const result = await provider.cleanup();
      containersRemoved += result.containersRemoved;
      volumesRemoved += result.volumesRemoved;
    }

    return { containersRemoved, volumesRemoved };
  }
}
