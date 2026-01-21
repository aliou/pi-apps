/**
 * Cloudflare sandbox provider implementation.
 *
 * Uses Cloudflare's Sandbox SDK via a Worker proxy.
 * @see https://developers.cloudflare.com/sandbox/
 *
 * The Cloudflare Sandbox SDK is designed to run within Cloudflare Workers.
 * This provider communicates with a deployed Worker that manages sandboxes
 * and exposes them via HTTP endpoints.
 *
 * Required environment variables:
 * - CLOUDFLARE_SANDBOX_WORKER_URL: URL of the Worker managing sandboxes
 * - CLOUDFLARE_API_TOKEN: API token for authentication with the Worker
 */

import type {
  ExecOptions,
  ExecOutput,
  ExecResult,
  Sandbox,
  SandboxConnection,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxProvider,
  SandboxProviderConfig,
  SandboxStatus,
} from "./types.js";

/**
 * Response types from the Cloudflare Worker proxy.
 */
interface WorkerCreateResponse {
  sandboxId: string;
  previewUrl?: string;
}

interface WorkerExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  success: boolean;
}

interface WorkerFileResponse {
  content: string;
  encoding?: "utf-8" | "base64";
}

interface WorkerSandboxInfo {
  id: string;
  status: string;
  createdAt: string;
  name?: string;
  tags?: Record<string, string>;
  previewUrl?: string;
}

interface WorkerListResponse {
  sandboxes: WorkerSandboxInfo[];
}

interface WorkerExposePortResponse {
  url: string;
  port: number;
}

/**
 * Cloudflare sandbox implementation.
 */
class CloudflareSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private workerUrl: string;
  private apiToken: string;
  private previewUrl?: string;
  private exposedPorts: Map<number, string> = new Map();
  private createdAt: Date;

  constructor(
    id: string,
    workerUrl: string,
    apiToken: string,
    previewUrl?: string,
  ) {
    this.id = id;
    this.workerUrl = workerUrl;
    this.apiToken = apiToken;
    this.previewUrl = previewUrl;
    this.createdAt = new Date();
  }

  get status(): SandboxStatus {
    return this._status;
  }

  private async request<T>(
    endpoint: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.workerUrl}/sandbox/${this.id}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Cloudflare sandbox error: ${response.status} - ${error}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async getInfo(): Promise<SandboxInfo> {
    try {
      const info = await this.request<WorkerSandboxInfo>("/info");
      this._status = this.mapStatus(info.status);
      return {
        id: this.id,
        status: this._status,
        createdAt: new Date(info.createdAt),
        name: info.name,
        tags: info.tags,
        metadata: {
          provider: "cloudflare",
          previewUrl: info.previewUrl,
        },
      };
    } catch {
      this._status = "error";
      return {
        id: this.id,
        status: this._status,
        createdAt: this.createdAt,
        metadata: { provider: "cloudflare" },
      };
    }
  }

  private mapStatus(status: string): SandboxStatus {
    switch (status.toLowerCase()) {
      case "creating":
        return "creating";
      case "starting":
        return "starting";
      case "running":
      case "ready":
        return "running";
      case "stopping":
        return "stopping";
      case "stopped":
      case "sleeping":
        return "stopped";
      default:
        return "error";
    }
  }

  async exec(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    const result = await this.request<WorkerExecResponse>("/exec", "POST", {
      command: fullCommand,
      cwd: options?.cwd,
      env: options?.env,
      timeout: options?.timeout,
    });

    if (options?.onStdout && result.stdout) {
      options.onStdout(result.stdout);
    }
    if (options?.onStderr && result.stderr) {
      options.onStderr(result.stderr);
    }

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async *execStream(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): AsyncGenerator<ExecOutput> {
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    const url = `${this.workerUrl}/sandbox/${this.id}/exec/stream`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        command: fullCommand,
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Cloudflare sandbox exec error: ${response.status} - ${error}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body for streaming exec");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data) as {
                stream: "stdout" | "stderr";
                data: string;
              };
              yield event;

              if (options?.onStdout && event.stream === "stdout") {
                options.onStdout(event.data);
              }
              if (options?.onStderr && event.stream === "stderr") {
                options.onStderr(event.data);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const contentStr =
      typeof content === "string" ? content : new TextDecoder().decode(content);
    const isBase64 = typeof content !== "string";

    await this.request("/file", "POST", {
      path,
      content: isBase64 ? Buffer.from(content).toString("base64") : contentStr,
      encoding: isBase64 ? "base64" : "utf-8",
    });
  }

  async readFile(path: string): Promise<string> {
    const result = await this.request<WorkerFileResponse>(
      `/file?path=${encodeURIComponent(path)}`,
    );

    if (result.encoding === "base64") {
      return Buffer.from(result.content, "base64").toString("utf-8");
    }
    return result.content;
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    await this.request("/mkdir", "POST", {
      path,
      recursive,
    });
  }

  async exposePort(port: number): Promise<string> {
    const cached = this.exposedPorts.get(port);
    if (cached) return cached;

    const result = await this.request<WorkerExposePortResponse>(
      "/port/expose",
      "POST",
      { port },
    );

    this.exposedPorts.set(port, result.url);
    return result.url;
  }

  async connect(port: number): Promise<SandboxConnection> {
    // Get or expose the port first
    let url = this.exposedPorts.get(port);
    if (!url) {
      url = await this.exposePort(port);
    }

    // Cloudflare sandboxes expose HTTP/WebSocket endpoints via preview URLs
    // For WebSocket connections, we upgrade the connection
    const wsUrl = url.replace(/^https?:/, "wss:");

    return new CloudflareConnection(wsUrl, this.apiToken);
  }

  async terminate(): Promise<void> {
    this._status = "stopping";
    try {
      await this.request("/destroy", "POST");
      this._status = "stopped";
    } catch (error) {
      this._status = "error";
      throw error;
    }
  }
}

/**
 * WebSocket connection to a Cloudflare sandbox.
 */
class CloudflareConnection implements SandboxConnection {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private apiToken: string;
  private _isOpen = false;
  private messageQueue: string[] = [];
  private resolvers: ((result: IteratorResult<string>) => void)[] = [];

  constructor(wsUrl: string, apiToken: string) {
    this.wsUrl = wsUrl;
    this.apiToken = apiToken;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  private async ensureConnection(): Promise<WebSocket> {
    if (this.ws && this._isOpen) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      // Add auth token as query parameter for WebSocket
      const url = new URL(this.wsUrl);
      url.searchParams.set("token", this.apiToken);

      const ws = new WebSocket(url.toString());
      this.ws = ws;

      ws.onopen = () => {
        this._isOpen = true;
        resolve(ws);
      };

      ws.onerror = (error) => {
        this._isOpen = false;
        reject(new Error(`WebSocket connection failed: ${error}`));
      };

      ws.onclose = () => {
        this._isOpen = false;
        for (const resolver of this.resolvers) {
          resolver({ done: true, value: undefined });
        }
        this.resolvers = [];
      };

      ws.onmessage = (event) => {
        const data =
          typeof event.data === "string" ? event.data : event.data.toString();

        if (this.resolvers.length > 0) {
          const resolver = this.resolvers.shift();
          if (resolver) {
            resolver({ done: false, value: data });
          }
        } else {
          this.messageQueue.push(data);
        }
      };
    });
  }

  async send(data: string | Uint8Array): Promise<void> {
    const ws = await this.ensureConnection();
    ws.send(data);
  }

  async *receive(): AsyncGenerator<string> {
    await this.ensureConnection();

    while (this._isOpen) {
      if (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) yield message;
        continue;
      }

      const result = await new Promise<IteratorResult<string>>((resolve) => {
        this.resolvers.push(resolve);
      });

      if (result.done) {
        break;
      }

      yield result.value;
    }
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isOpen = false;
  }
}

/**
 * Cloudflare sandbox provider.
 *
 * Communicates with a Cloudflare Worker that manages sandboxes using the
 * @cloudflare/sandbox SDK. The Worker must expose HTTP endpoints for:
 * - POST /sandbox/create - Create a new sandbox
 * - GET /sandbox/:id/info - Get sandbox info
 * - POST /sandbox/:id/exec - Execute a command
 * - POST /sandbox/:id/exec/stream - Execute with streaming (SSE)
 * - GET /sandbox/:id/file - Read a file
 * - POST /sandbox/:id/file - Write a file
 * - POST /sandbox/:id/mkdir - Create directory
 * - POST /sandbox/:id/port/expose - Expose a port
 * - POST /sandbox/:id/destroy - Terminate sandbox
 * - GET /sandboxes - List all sandboxes
 */
export class CloudflareSandboxProvider implements SandboxProvider {
  readonly name = "cloudflare";
  private workerUrl: string;
  private apiToken: string;
  private config: SandboxProviderConfig;

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "cloudflare") {
      throw new Error(
        `Invalid provider: ${config.provider}, expected "cloudflare"`,
      );
    }

    this.config = config;

    // Worker URL can be passed via providerConfig or as the apiToken in format "url|token"
    const workerUrl = config.providerConfig?.workerUrl as string | undefined;
    if (workerUrl) {
      this.workerUrl = workerUrl;
      this.apiToken = config.apiToken ?? "";
    } else if (config.apiToken?.includes("|")) {
      // Support format: "worker-url|api-token"
      const [url, token] = config.apiToken.split("|");
      this.workerUrl = url;
      this.apiToken = token;
    } else {
      // Default to environment variable
      const envUrl = process.env.CLOUDFLARE_SANDBOX_WORKER_URL;
      if (!envUrl) {
        throw new Error(
          "CLOUDFLARE_SANDBOX_WORKER_URL environment variable is required, " +
            "or pass workerUrl in providerConfig",
        );
      }
      this.workerUrl = envUrl;
      this.apiToken = config.apiToken ?? "";
    }

    if (!this.apiToken) {
      throw new Error(
        "CLOUDFLARE_API_TOKEN is required for cloudflare provider",
      );
    }

    // Ensure URL doesn't have trailing slash
    this.workerUrl = this.workerUrl.replace(/\/$/, "");
  }

  private async request<T>(
    endpoint: string,
    method: string = "GET",
    body?: unknown,
  ): Promise<T> {
    const url = `${this.workerUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Cloudflare sandbox error: ${response.status} - ${error}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const instanceType =
      options.instanceType ?? this.config.defaultInstanceType ?? "small";

    // Map instance type to Cloudflare resource specs
    const specs = {
      nano: { vcpu: 0.5, memoryMB: 512 },
      small: { vcpu: 1, memoryMB: 1024 },
      medium: { vcpu: 2, memoryMB: 2048 },
      large: { vcpu: 4, memoryMB: 4096 },
    }[instanceType];

    const result = await this.request<WorkerCreateResponse>(
      "/sandbox/create",
      "POST",
      {
        image: options.image ?? this.config.defaultImage,
        env: options.env,
        name: options.name,
        tags: options.tags,
        timeout: options.timeout ?? this.config.defaultTimeout ?? 5 * 60 * 1000,
        idleTimeout:
          options.idleTimeout ?? this.config.defaultIdleTimeout ?? 60 * 1000,
        resources: specs,
      },
    );

    return new CloudflareSandboxImpl(
      result.sandboxId,
      this.workerUrl,
      this.apiToken,
      result.previewUrl,
    );
  }

  async listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]> {
    const queryParams = tags
      ? `?tags=${encodeURIComponent(JSON.stringify(tags))}`
      : "";

    const result = await this.request<WorkerListResponse>(
      `/sandboxes${queryParams}`,
    );

    return result.sandboxes.map((sb) => ({
      id: sb.id,
      status: this.mapStatus(sb.status),
      createdAt: new Date(sb.createdAt),
      name: sb.name,
      tags: sb.tags,
      metadata: {
        provider: "cloudflare",
        previewUrl: sb.previewUrl,
      },
    }));
  }

  private mapStatus(status: string): SandboxStatus {
    switch (status.toLowerCase()) {
      case "creating":
        return "creating";
      case "starting":
        return "starting";
      case "running":
      case "ready":
        return "running";
      case "stopping":
        return "stopping";
      case "stopped":
      case "sleeping":
        return "stopped";
      default:
        return "error";
    }
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const info = await this.request<WorkerSandboxInfo>(
        `/sandbox/${sandboxId}/info`,
      );
      return new CloudflareSandboxImpl(
        sandboxId,
        this.workerUrl,
        this.apiToken,
        info.previewUrl,
      );
    } catch {
      return null;
    }
  }

  async getSandboxByName(name: string): Promise<Sandbox | null> {
    try {
      const result = await this.request<WorkerListResponse>(
        `/sandboxes?name=${encodeURIComponent(name)}`,
      );
      if (result.sandboxes.length === 0) {
        return null;
      }
      const sb = result.sandboxes[0];
      return new CloudflareSandboxImpl(
        sb.id,
        this.workerUrl,
        this.apiToken,
        sb.previewUrl,
      );
    } catch {
      return null;
    }
  }
}
