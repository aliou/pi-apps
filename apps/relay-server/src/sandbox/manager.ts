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
  provider: SandboxProviderType;
  docker?: DockerProviderConfig;
}

/**
 * Manages sandbox lifecycle and provider selection.
 */
export class SandboxManager {
  private provider: SandboxProvider;

  constructor(config: SandboxManagerConfig) {
    switch (config.provider) {
      case "docker":
        this.provider = new DockerSandboxProvider(config.docker);
        break;
      default:
        this.provider = new MockSandboxProvider();
        break;
    }
  }

  get providerName(): string {
    return this.provider.name;
  }

  async isProviderAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async createForSession(
    sessionId: string,
    options?: Omit<CreateSandboxOptions, "sessionId">,
  ): Promise<SandboxHandle> {
    return this.provider.createSandbox({ sessionId, ...options });
  }

  getForSession(sessionId: string): SandboxHandle | undefined {
    return this.provider.getSandbox(sessionId);
  }

  async terminateForSession(sessionId: string): Promise<void> {
    const handle = this.provider.getSandbox(sessionId);
    if (handle) {
      await handle.terminate();
      this.provider.removeSandbox(sessionId);
    }
  }

  async listAll(): Promise<SandboxInfo[]> {
    if (this.provider.listSandboxes) {
      return this.provider.listSandboxes();
    }
    return [];
  }

  async cleanup(): Promise<CleanupResult> {
    if (this.provider.cleanup) {
      return this.provider.cleanup();
    }
    return { containersRemoved: 0, volumesRemoved: 0 };
  }
}
