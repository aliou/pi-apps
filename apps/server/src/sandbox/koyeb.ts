/**
 * Koyeb sandbox provider implementation.
 *
 * Uses the official Koyeb Sandbox SDK for JavaScript/TypeScript.
 * @see https://github.com/koyeb/koyeb-sandbox-sdk-js
 *
 * Install: npm install @koyeb/api-client-js @koyeb/sandbox-sdk
 * Requires: KOYEB_API_TOKEN environment variable
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

// Koyeb SDK types (from @koyeb/sandbox-sdk)
// These interfaces match the actual SDK for type safety
interface KoyebSandboxCreateOptions {
  image?: string;
  name?: string;
  wait_ready?: boolean;
  instance_type?: string;
  env?: Record<string, string>;
  region?: string;
  api_token?: string;
  timeout?: number;
  idle_timeout?: number;
  enable_tcp_proxy?: boolean;
  privileged?: boolean;
  exposed_port_protocol?: "http" | "http2";
}

interface KoyebSandboxExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

interface KoyebSandboxExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

interface KoyebSandboxFilesystem {
  mkdir(path: string, recursive?: boolean): Promise<void>;
  list_dir(path?: string): Promise<string[]>;
  delete_dir(path: string): Promise<void>;
  write_file(path: string, content: string): Promise<void>;
  write_files(files: Record<string, string>): Promise<void>;
  read_file(path: string): Promise<{ content: string; encoding: string }>;
  rename_file(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  is_file(path: string): Promise<boolean>;
  is_dir(path: string): Promise<boolean>;
  upload_file(localPath: string, remotePath: string): Promise<void>;
  download_file(localPath: string, remotePath: string): Promise<void>;
}

interface KoyebSandboxExecStream extends EventTarget {
  addEventListener(
    type: "stdout",
    listener: (event: { data: { data: string } }) => void,
  ): void;
  addEventListener(
    type: "stderr",
    listener: (event: { data: { data: string } }) => void,
  ): void;
  addEventListener(
    type: "exit",
    listener: (event: { data: { code: number } }) => void,
  ): void;
  addEventListener(type: "end", listener: () => void): void;
}

interface KoyebSandboxClass {
  id?: string;
  filesystem: KoyebSandboxFilesystem;

  wait_ready(): Promise<void>;
  wait_tcp_proxy_ready(): Promise<void>;
  is_healthy(): Promise<boolean>;
  get_sandbox_url(): Promise<string>;
  get_tcp_proxy_info(): Promise<[string, number] | undefined>;
  get_domain(): Promise<string>;
  update_lifecycle(options: { idle_timeout?: number }): Promise<void>;
  delete(): Promise<void>;

  exec(cmd: string, options?: KoyebSandboxExecOptions): Promise<KoyebSandboxExecResult>;
  exec_stream(cmd: string, options?: KoyebSandboxExecOptions): KoyebSandboxExecStream;

  expose_port(port: number): Promise<{ port: number; exposed_at: string }>;
  unexpose_port(port?: number): Promise<void>;

  launch_process(
    cmd: string,
    options?: KoyebSandboxExecOptions,
  ): Promise<string>;
  kill_process(processId: string): Promise<void>;
  list_processes(): Promise<{ id: string; status: string }[]>;
  kill_all_processes(): Promise<number>;
}

interface KoyebSandboxModule {
  Sandbox: {
    create(options?: KoyebSandboxCreateOptions): Promise<KoyebSandboxClass>;
    get_from_id(
      serviceId: string,
      apiToken?: string,
    ): Promise<KoyebSandboxClass>;
  };
}

/**
 * Get the Koyeb SDK (lazy loaded).
 */
async function getKoyebSdk(): Promise<KoyebSandboxModule> {
  try {
    // @ts-expect-error - @koyeb/sandbox-sdk package is optional, types defined above
    const sdk = (await import("@koyeb/sandbox-sdk")) as KoyebSandboxModule;
    return sdk;
  } catch (error) {
    throw new Error(
      `Failed to load Koyeb Sandbox SDK. Install it with: npm install @koyeb/api-client-js @koyeb/sandbox-sdk. Error: ${error}`,
    );
  }
}

/**
 * Koyeb sandbox implementation.
 */
class KoyebSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private koyebSandbox: KoyebSandboxClass;
  private exposedPorts: Map<number, string> = new Map();
  private createdAt: Date;

  constructor(id: string, koyebSandbox: KoyebSandboxClass) {
    this.id = id;
    this.koyebSandbox = koyebSandbox;
    this.createdAt = new Date();
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async getInfo(): Promise<SandboxInfo> {
    // Check health to update status
    try {
      const healthy = await this.koyebSandbox.is_healthy();
      this._status = healthy ? "running" : "error";
    } catch {
      this._status = "error";
    }

    return {
      id: this.id,
      status: this._status,
      createdAt: this.createdAt,
      metadata: {
        provider: "koyeb",
      },
    };
  }

  async exec(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<ExecResult> {
    // Koyeb SDK expects command as a single string
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    const result = await this.koyebSandbox.exec(fullCommand, {
      cwd: options?.cwd,
      env: options?.env,
    });

    // Call callbacks if provided
    if (options?.onStdout && result.stdout) {
      options.onStdout(result.stdout);
    }
    if (options?.onStderr && result.stderr) {
      options.onStderr(result.stderr);
    }

    return {
      exitCode: result.code,
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

    const stream = this.koyebSandbox.exec_stream(fullCommand, {
      cwd: options?.cwd,
      env: options?.env,
    });

    // Create an async generator from the event stream
    const outputs: ExecOutput[] = [];
    let done = false;
    let resolveNext: ((value: IteratorResult<ExecOutput>) => void) | null =
      null;

    const enqueue = (output: ExecOutput) => {
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ done: false, value: output });
      } else {
        outputs.push(output);
      }
    };

    const finish = () => {
      done = true;
      if (resolveNext) {
        resolveNext({ done: true, value: undefined });
      }
    };

    stream.addEventListener("stdout", ({ data }) => {
      const output: ExecOutput = { stream: "stdout", data: data.data };
      enqueue(output);
      if (options?.onStdout) {
        options.onStdout(data.data);
      }
    });

    stream.addEventListener("stderr", ({ data }) => {
      const output: ExecOutput = { stream: "stderr", data: data.data };
      enqueue(output);
      if (options?.onStderr) {
        options.onStderr(data.data);
      }
    });

    stream.addEventListener("end", () => {
      finish();
    });

    while (!done || outputs.length > 0) {
      if (outputs.length > 0) {
        yield outputs.shift()!;
      } else if (!done) {
        yield await new Promise<ExecOutput>((resolve) => {
          resolveNext = (result) => {
            if (!result.done) {
              resolve(result.value);
            }
          };
        });
      }
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const contentStr =
      typeof content === "string" ? content : new TextDecoder().decode(content);
    await this.koyebSandbox.filesystem.write_file(path, contentStr);
  }

  async readFile(path: string): Promise<string> {
    const result = await this.koyebSandbox.filesystem.read_file(path);
    return result.content;
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    await this.koyebSandbox.filesystem.mkdir(path, recursive);
  }

  async exposePort(port: number): Promise<string> {
    const result = await this.koyebSandbox.expose_port(port);
    const url = result.exposed_at;
    this.exposedPorts.set(port, url);
    return url;
  }

  async connect(port: number): Promise<SandboxConnection> {
    // Check if TCP proxy is available
    const proxyInfo = await this.koyebSandbox.get_tcp_proxy_info();
    if (!proxyInfo) {
      throw new Error(
        "TCP proxy not enabled. Create sandbox with enable_tcp_proxy: true",
      );
    }

    const [host, publicPort] = proxyInfo;
    return new KoyebSandboxConnection(host, publicPort);
  }

  async terminate(): Promise<void> {
    this._status = "stopping";
    try {
      await this.koyebSandbox.delete();
      this._status = "stopped";
    } catch (error) {
      this._status = "error";
      throw error;
    }
  }
}

/**
 * WebSocket connection to a Koyeb sandbox TCP proxy.
 */
class KoyebSandboxConnection implements SandboxConnection {
  private ws: WebSocket | null = null;
  private host: string;
  private port: number;
  private _isOpen = false;
  private messageQueue: string[] = [];
  private resolvers: ((value: IteratorResult<string>) => void)[] = [];

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  private async ensureConnection(): Promise<WebSocket> {
    if (this.ws && this._isOpen) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `wss://${this.host}:${this.port}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this._isOpen = true;
        resolve(this.ws!);
      };

      this.ws.onerror = (error) => {
        this._isOpen = false;
        reject(new Error(`WebSocket connection failed: ${error}`));
      };

      this.ws.onclose = () => {
        this._isOpen = false;
        for (const resolver of this.resolvers) {
          resolver({ done: true, value: undefined });
        }
        this.resolvers = [];
      };

      this.ws.onmessage = (event) => {
        const data =
          typeof event.data === "string"
            ? event.data
            : event.data.toString();

        if (this.resolvers.length > 0) {
          const resolver = this.resolvers.shift()!;
          resolver({ done: false, value: data });
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
        yield this.messageQueue.shift()!;
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
    this._isOpen = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isOpen(): boolean {
    return this._isOpen;
  }
}

/**
 * Koyeb sandbox provider.
 */
export class KoyebSandboxProvider implements SandboxProvider {
  readonly name = "koyeb";
  private config: SandboxProviderConfig;
  private sdk: KoyebSandboxModule | null = null;

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "koyeb") {
      throw new Error(
        `Invalid provider: ${config.provider}, expected "koyeb"`,
      );
    }
    this.config = config;

    // Set environment variable for SDK
    if (config.apiToken) {
      process.env.KOYEB_API_TOKEN = config.apiToken;
    }
  }

  private async ensureSdk(): Promise<KoyebSandboxModule> {
    if (!this.sdk) {
      this.sdk = await getKoyebSdk();
    }
    return this.sdk;
  }

  private mapInstanceType(type: string | undefined): string {
    // Map our normalized instance types to Koyeb's
    // Koyeb supports: nano, micro, small, medium, large, xlarge, 2xlarge
    switch (type) {
      case "nano":
        return "nano";
      case "small":
        return "small";
      case "medium":
        return "medium";
      case "large":
        return "large";
      default:
        return "micro"; // Koyeb's default
    }
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const sdk = await this.ensureSdk();

    const instanceType = this.mapInstanceType(
      options.instanceType ?? this.config.defaultInstanceType,
    );

    const koyebSandbox = await sdk.Sandbox.create({
      image: options.image ?? this.config.defaultImage ?? "koyeb/sandbox",
      name: options.name,
      instance_type: instanceType,
      env: options.env,
      wait_ready: true,
      timeout:
        (options.timeout ?? this.config.defaultTimeout ?? 5 * 60 * 1000) / 1000,
      idle_timeout:
        (options.idleTimeout ?? this.config.defaultIdleTimeout ?? 60 * 1000) /
        1000,
      api_token: this.config.apiToken,
      region: (this.config.providerConfig?.region as string) ?? "na",
      enable_tcp_proxy:
        (this.config.providerConfig?.enableTcpProxy as boolean) ?? true,
    });

    // Generate ID from the sandbox URL or use a UUID
    const sandboxUrl = await koyebSandbox.get_sandbox_url();
    const id = koyebSandbox.id ?? sandboxUrl.split("/").pop() ?? crypto.randomUUID();

    return new KoyebSandboxImpl(id, koyebSandbox);
  }

  async listSandboxes(_tags?: Record<string, string>): Promise<SandboxInfo[]> {
    // Koyeb SDK doesn't have a direct list method
    // This would require using the Koyeb API directly
    console.warn(
      "listSandboxes not fully supported in Koyeb SDK - returning empty list",
    );
    return [];
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const sdk = await this.ensureSdk();
      const koyebSandbox = await sdk.Sandbox.get_from_id(
        sandboxId,
        this.config.apiToken,
      );
      return new KoyebSandboxImpl(sandboxId, koyebSandbox);
    } catch {
      return null;
    }
  }

  async getSandboxByName(_name: string): Promise<Sandbox | null> {
    // Koyeb SDK doesn't support lookup by name directly
    console.warn("getSandboxByName not supported in Koyeb SDK");
    return null;
  }
}
