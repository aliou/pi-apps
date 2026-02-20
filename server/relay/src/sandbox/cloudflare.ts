import { createLogger } from "../lib/logger";
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

const log = createLogger("cloudflare");

// ─── Channel ────────────────────────────────────────────────────────────────

/**
 * SandboxChannel backed by a WebSocket connection to the CF Worker.
 * Each WS frame is a complete JSON line (pi RPC message).
 * The bridge inside the CF container handles stdin/stdout framing.
 */
class CloudflareSandboxChannel implements SandboxChannel {
  private closed = false;
  private messageHandlers = new Set<(message: string) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();

  constructor(private ws: WebSocket) {
    this.ws.addEventListener("message", (event: MessageEvent) => {
      if (this.closed) return;
      const data =
        typeof event.data === "string" ? event.data : String(event.data);
      for (const handler of this.messageHandlers) {
        handler(data);
      }
    });

    this.ws.addEventListener("close", (event: CloseEvent) => {
      if (this.closed) return;
      this.closed = true;
      const reason = event.reason || `WebSocket closed (code: ${event.code})`;
      for (const handler of this.closeHandlers) {
        handler(reason);
      }
      this.messageHandlers.clear();
      this.closeHandlers.clear();
    });

    this.ws.addEventListener("error", () => {
      if (this.closed) return;
      this.closed = true;
      for (const handler of this.closeHandlers) {
        handler("WebSocket error");
      }
      this.messageHandlers.clear();
      this.closeHandlers.clear();
    });
  }

  send(message: string): void {
    if (this.closed) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
  }

  onMessage(handler: (message: string) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onClose(handler: (reason?: string) => void): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.messageHandlers.clear();
    this.closeHandlers.clear();
    this.ws.close();
  }
}

// ─── Handle ─────────────────────────────────────────────────────────────────

interface CloudflareHandleConfig {
  workerUrl: string;
  apiToken: string;
  sessionId: string;
}

/**
 * Handle for a Cloudflare-based sandbox.
 * Lifecycle operations (resume, pause, terminate) use HTTP to the Worker.
 * attach() opens a WebSocket to the Worker for pi RPC communication.
 */
class CloudflareSandboxHandle implements SandboxHandle {
  private _status: SandboxStatus;
  private statusListeners = new Set<(status: SandboxStatus) => void>();
  private currentChannel: CloudflareSandboxChannel | null = null;

  constructor(
    private config: CloudflareHandleConfig,
    initialStatus: SandboxStatus = "creating",
  ) {
    this._status = initialStatus;
  }

  get sessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Provider ID is deterministic: cf-<sessionId>.
   * The Worker addresses the DO by sessionId via getContainer(binding, id).
   */
  get providerId(): string {
    return `cf-${this.config.sessionId}`;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  get imageDigest(): string | undefined {
    return undefined;
  }

  async resume(
    secrets?: Record<string, string>,
    githubToken?: string,
  ): Promise<void> {
    const envVars: Record<string, string> = {};
    if (secrets) {
      for (const [key, value] of Object.entries(secrets)) {
        envVars[key.toUpperCase()] = value;
      }
    }

    if (githubToken) {
      envVars.GH_TOKEN = githubToken;
    }

    const response = await this.workerFetch(
      `/api/sandboxes/${this.config.sessionId}/resume`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVars }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resume failed: ${response.status} ${text}`);
    }

    this.setStatus("running");
  }

  async attach(): Promise<SandboxChannel> {
    if (this._status !== "running") {
      throw new Error(
        `Cannot attach to sandbox in "${this._status}" status (must be "running")`,
      );
    }

    // Close previous channel if exists
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    // Build WS URL from the HTTP worker URL
    const wsUrl = this.config.workerUrl
      .replace(/^http/, "ws")
      .replace(/\/$/, "");
    const fullUrl = `${wsUrl}/ws/sandboxes/${this.config.sessionId}`;

    // Node.js 22 WebSocket accepts headers in the options object
    const ws = new WebSocket(fullUrl, {
      headers: { "X-Relay-Secret": this.config.apiToken },
    } as unknown as string[]);

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            `WebSocket connection timeout (10s) for sandbox in status "${this._status}"`,
          ),
        );
      }, 10_000);

      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed: ${event}`));
      });
    });

    const channel = new CloudflareSandboxChannel(ws);
    this.currentChannel = channel;

    // If WS closes unexpectedly while running, poll status once to confirm
    channel.onClose(() => {
      if (this._status === "running") {
        this.pollStatusOnce();
      }
    });

    return channel;
  }

  async pause(): Promise<void> {
    // Close channel before pausing
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    const response = await this.workerFetch(
      `/api/sandboxes/${this.config.sessionId}/pause`,
      { method: "POST" },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pause failed: ${response.status} ${text}`);
    }

    this.setStatus("paused");
  }

  async terminate(): Promise<void> {
    if (this.currentChannel) {
      this.currentChannel.close();
      this.currentChannel = null;
    }

    try {
      const response = await this.workerFetch(
        `/api/sandboxes/${this.config.sessionId}`,
        { method: "DELETE" },
      );

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        throw new Error(`Terminate failed: ${response.status} ${text}`);
      }
    } catch (err) {
      // Re-throw non-network errors (e.g., 500)
      if (err instanceof Error && err.message.startsWith("Terminate failed")) {
        throw err;
      }
      // Sandbox may already be gone — that's fine
    }

    this.setStatus("stopped");
  }

  /**
   * Execute a command inside the running container via the bridge's /exec endpoint.
   */
  async exec(command: string): Promise<{ exitCode: number; output: string }> {
    const response = await this.workerFetch(
      `/api/sandboxes/${this.config.sessionId}/exec`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      return { exitCode: 1, output: text };
    }

    try {
      const data = JSON.parse(text) as { output?: string; exitCode?: number };
      return {
        exitCode: data.exitCode ?? 0,
        output: data.output ?? "",
      };
    } catch {
      return { exitCode: 0, output: text };
    }
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  // --- Internal helpers ---

  private setStatus(status: SandboxStatus): void {
    if (this._status !== status) {
      this._status = status;
      for (const listener of this.statusListeners) {
        listener(status);
      }
    }
  }

  private async workerFetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const url = `${this.config.workerUrl.replace(/\/$/, "")}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "X-Relay-Secret": this.config.apiToken,
      },
    });
  }

  /**
   * One-shot status poll after unexpected WS disconnect.
   * Confirms actual container state from the Worker.
   */
  private async pollStatusOnce(): Promise<void> {
    try {
      const response = await this.workerFetch(
        `/api/sandboxes/${this.config.sessionId}/status`,
      );
      if (response.ok) {
        const data = (await response.json()) as { status: string };
        const mapped = mapWorkerStatus(data.status);
        this.setStatus(mapped);
      } else {
        this.setStatus("error");
      }
    } catch (err) {
      log.error(
        { err, sessionId: this.config.sessionId },
        "status poll failed",
      );
      this.setStatus("error");
    }
  }
}

// ─── Provider ───────────────────────────────────────────────────────────────

export interface CloudflareProviderConfig {
  /** Full URL to the CF Worker (e.g., https://pi-sandbox-worker.xxx.workers.dev) */
  workerUrl: string;
  /** Shared secret for Worker auth (must match Worker's RELAY_SECRET) */
  apiToken: string;
}

/**
 * Cloudflare Containers sandbox provider.
 * Manages sandboxes by communicating with a CF Worker via HTTP/WebSocket.
 *
 * Unlike DockerSandboxProvider which manages containers directly,
 * this provider is a thin HTTP client. The Worker + Durable Object handles
 * the actual container lifecycle.
 */
export class CloudflareSandboxProvider implements SandboxProvider {
  readonly name = "cloudflare";

  readonly capabilities: SandboxProviderCapabilities = {
    losslessPause: false,
    persistentDisk: false,
  };

  private config: CloudflareProviderConfig;

  constructor(config: CloudflareProviderConfig) {
    if (
      !config.workerUrl ||
      (!config.workerUrl.startsWith("http://") &&
        !config.workerUrl.startsWith("https://"))
    ) {
      throw new Error(
        "CloudflareProviderConfig: workerUrl must be a valid HTTP(S) URL",
      );
    }
    if (!config.apiToken || config.apiToken.trim().length === 0) {
      throw new Error(
        "CloudflareProviderConfig: apiToken must be a non-empty string",
      );
    }
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.workerFetch("/health");
      return response.ok;
    } catch {
      return false;
    }
  }

  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    const {
      sessionId,
      env: envOverrides = {},
      secrets,
      repoUrl,
      repoBranch,
      githubToken,
      nativeToolsEnabled,
    } = options;

    // Merge env overrides and secrets (uppercased)
    const envVars: Record<string, string> = { ...envOverrides };

    // Tell the bridge to load the native bridge extension (baked into image)
    if (nativeToolsEnabled) {
      envVars.PI_EXTENSIONS = "/opt/extensions/native-bridge.ts";
    }
    if (secrets) {
      for (const [key, value] of Object.entries(secrets)) {
        envVars[key.toUpperCase()] = value;
      }
    }

    if (githubToken) {
      envVars.GH_TOKEN = githubToken;
    }

    const response = await this.workerFetch(`/api/sandboxes/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envVars, repoUrl, repoBranch }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create sandbox: ${response.status} ${text}`);
    }

    return new CloudflareSandboxHandle(
      {
        workerUrl: this.config.workerUrl,
        apiToken: this.config.apiToken,
        sessionId,
      },
      "running",
    );
  }

  async getSandbox(providerId: string): Promise<SandboxHandle> {
    // Extract session ID from provider ID (format: cf-<sessionId>)
    const sessionId = providerId.startsWith("cf-")
      ? providerId.slice(3)
      : providerId;

    const response = await this.workerFetch(
      `/api/sandboxes/${sessionId}/status`,
    );

    if (!response.ok) {
      throw new Error(
        `Sandbox not found: ${providerId} (status: ${response.status})`,
      );
    }

    const data = (await response.json()) as {
      status: string;
      hasBackup?: boolean;
    };

    // Map CF status to our status
    let status: SandboxStatus;
    if (data.status === "running" || data.status === "healthy") {
      status = "running";
    } else if (
      (data.status === "stopped" || data.status === "stopped_with_code") &&
      data.hasBackup
    ) {
      // Container stopped but has R2 backup -> can resume
      status = "paused";
    } else if (
      data.status === "stopped" ||
      data.status === "stopped_with_code"
    ) {
      status = "stopped";
    } else {
      status = "error";
    }

    return new CloudflareSandboxHandle(
      {
        workerUrl: this.config.workerUrl,
        apiToken: this.config.apiToken,
        sessionId,
      },
      status,
    );
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    // CF Worker has no "list all DOs" API.
    // The relay DB is the source of truth for session -> provider mapping.
    return [];
  }

  async cleanup(): Promise<CleanupResult> {
    // CF auto-cleans containers after inactivity timeout.
    // R2 state is deleted on terminate.
    return { sandboxesRemoved: 0, artifactsRemoved: 0 };
  }

  // --- Internal ---

  private async workerFetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const url = `${this.config.workerUrl.replace(/\/$/, "")}${path}`;
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "X-Relay-Secret": this.config.apiToken,
      },
    });
  }
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Map CF Container status strings to our SandboxStatus. */
function mapWorkerStatus(cfStatus: string): SandboxStatus {
  switch (cfStatus) {
    case "running":
    case "healthy":
      return "running";
    case "stopping":
    case "stopped":
    case "stopped_with_code":
      return "stopped";
    default:
      return "error";
  }
}
