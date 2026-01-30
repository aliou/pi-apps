import { type DockerProviderConfig, DockerSandboxProvider } from "./docker";
import { MockSandboxProvider } from "./mock";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
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

interface SessionTracking {
  provider: SandboxProviderType;
  handle: SandboxHandle;
}

/**
 * Manages sandbox lifecycle with support for multiple providers.
 * Sessions can specify which provider to use at creation time.
 */
export class SandboxManager {
  private providers = new Map<SandboxProviderType, SandboxProvider>();
  private sessions = new Map<string, SessionTracking>();
  private defaultProvider: SandboxProviderType;

  constructor(config: SandboxManagerConfig) {
    this.defaultProvider = config.defaultProvider;

    const enabled = config.enabledProviders ?? ["mock", "docker"];

    // Initialize enabled providers
    if (enabled.includes("mock")) {
      this.providers.set("mock", new MockSandboxProvider());
    }
    if (enabled.includes("docker")) {
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
   * @param sessionId - Session ID
   * @param options - Creation options
   * @param providerType - Provider to use (defaults to defaultProvider)
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

    const handle = await provider.createSandbox({ sessionId, ...options });

    // Track which provider this session uses
    this.sessions.set(sessionId, { provider: type, handle });

    return handle;
  }

  /** Get sandbox handle for a session */
  getForSession(sessionId: string): SandboxHandle | undefined {
    return this.sessions.get(sessionId)?.handle;
  }

  /** Get which provider a session is using */
  getProviderForSession(sessionId: string): SandboxProviderType | undefined {
    return this.sessions.get(sessionId)?.provider;
  }

  /** Terminate sandbox for a session */
  async terminateForSession(sessionId: string): Promise<void> {
    const tracking = this.sessions.get(sessionId);
    if (!tracking) return;

    const provider = this.providers.get(tracking.provider);
    if (provider) {
      await tracking.handle.terminate();
      provider.removeSandbox(sessionId);
    }

    this.sessions.delete(sessionId);
  }

  /** List all active sandboxes across all providers */
  async listAll(): Promise<
    (SandboxInfo & { provider: SandboxProviderType })[]
  > {
    const results: (SandboxInfo & { provider: SandboxProviderType })[] = [];

    for (const [type, provider] of this.providers) {
      if (provider.listSandboxes) {
        const sandboxes = await provider.listSandboxes();
        for (const sandbox of sandboxes) {
          results.push({ ...sandbox, provider: type });
        }
      }
    }

    return results;
  }

  /** Cleanup stopped sandboxes across all providers */
  async cleanup(): Promise<CleanupResult> {
    let containersRemoved = 0;
    let volumesRemoved = 0;

    for (const provider of this.providers.values()) {
      if (provider.cleanup) {
        const result = await provider.cleanup();
        containersRemoved += result.containersRemoved;
        volumesRemoved += result.volumesRemoved;
      }
    }

    return { containersRemoved, volumesRemoved };
  }
}
