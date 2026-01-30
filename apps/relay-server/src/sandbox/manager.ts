import type { SandboxHandle, SandboxProvider } from "./types";

/**
 * Manages sandbox lifecycle and provider selection.
 */
export class SandboxManager {
  constructor(private provider: SandboxProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  async isProviderAvailable(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  async createForSession(
    sessionId: string,
    env?: Record<string, string>,
  ): Promise<SandboxHandle> {
    return this.provider.createSandbox({ sessionId, env });
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
}
