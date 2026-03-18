import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../lib/logger";
import { detectPiBinary, type PiDetectionResult } from "./local/detect-pi";
import { LocalSandboxHandle } from "./local/handle";
import { prepareLocalWorkspace } from "./local/workspace";
import type { SandboxLogStore } from "./log-store";
import type { EnvironmentSandboxConfig } from "./manager";
import type {
  CleanupResult,
  CreateSandboxOptions,
  SandboxHandle,
  SandboxInfo,
  SandboxProvider,
  SandboxProviderCapabilities,
} from "./types";

const log = createLogger("local-sandbox");

export interface LocalSandboxProviderConfig {
  sessionDataDir: string;
  envConfig: EnvironmentSandboxConfig;
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilities: SandboxProviderCapabilities = {
    losslessPause: false,
    persistentDisk: true,
  };

  private readonly handles = new Map<string, LocalSandboxHandle>();

  constructor(
    private readonly config: LocalSandboxProviderConfig,
    private readonly logStore?: SandboxLogStore,
  ) {}

  async isAvailable(): Promise<boolean> {
    const result = await detectPiBinary();
    return result.available;
  }

  async getStatus(): Promise<PiDetectionResult> {
    return detectPiBinary();
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const detection = await detectPiBinary();
    if (!detection.available || !detection.path) {
      throw new Error(detection.error ?? "Local pi binary is not available");
    }

    await mkdir(join(this.config.sessionDataDir, options.sessionId), {
      recursive: true,
    });

    const workspace = await prepareLocalWorkspace(
      this.config.sessionDataDir,
      this.config.envConfig,
      options,
    );

    const providerId = `local:${options.sessionId}`;
    const handle = new LocalSandboxHandle({
      sessionId: options.sessionId,
      providerId,
      piPath: detection.path,
      workspacePath: workspace.path,
      env: options.secretMaterial?.directEnv ?? options.secrets ?? {},
      logStore: this.logStore,
      cleanupWorkspace: workspace.cleanup,
    });
    this.handles.set(providerId, handle);
    log.info(
      { sessionId: options.sessionId, workspace: workspace.path },
      "local sandbox prepared",
    );
    return handle;
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    const handle = this.handles.get(providerId);
    if (!handle) {
      throw new Error(
        `Local sandbox not found: ${providerId}. Local sandboxes are in-memory only and do not survive relay restarts. Start a new session to continue locally.`,
      );
    }
    return handle;
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    return Array.from(this.handles.values()).map((handle) => ({
      sessionId: handle.sessionId,
      providerId: handle.providerId,
      status: handle.status,
      createdAt: new Date().toISOString(),
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
