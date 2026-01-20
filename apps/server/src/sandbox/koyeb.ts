/**
 * Koyeb sandbox provider implementation.
 *
 * Uses the official Koyeb Sandbox SDK for JavaScript/TypeScript.
 * @see https://github.com/koyeb/koyeb-sandbox-sdk-js
 *
 * Install: npm install @koyeb/sandbox-sdk
 * Requires: KOYEB_API_TOKEN environment variable
 */

import { Sandbox as KoyebSandbox } from "@koyeb/sandbox-sdk";
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
 * Koyeb sandbox implementation.
 */
class KoyebSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private koyebSandbox: any;
  private exposedPorts: Map<number, string> = new Map();
  private createdAt: Date;

  constructor(id: string, koyebSandbox: any) {
    this.id = id;
    this.koyebSandbox = koyebSandbox;
    this.createdAt = new Date();
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async getInfo(): Promise<SandboxInfo> {
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
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    const result = await this.koyebSandbox.exec(fullCommand, {
      cwd: options?.cwd,
      env: options?.env,
    });

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

    stream.addEventListener("stdout", ({ data }: { data: { data: string } }) => {
      const output: ExecOutput = { stream: "stdout", data: data.data };
      enqueue(output);
      if (options?.onStdout) {
        options.onStdout(data.data);
      }
    });

    stream.addEventListener("stderr", ({ data }: { data: { data: string } }) => {
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

  async connect(_port: number): Promise<SandboxConnection> {
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
          typeof event.data === "string" ? event.data : event.data.toString();

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

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "koyeb") {
      throw new Error(
        `Invalid provider: ${config.provider}, expected "koyeb"`,
      );
    }
    this.config = config;

    if (config.apiToken) {
      process.env.KOYEB_API_TOKEN = config.apiToken;
    }
  }

  private mapInstanceType(type: string | undefined): string {
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
        return "micro";
    }
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const instanceType = this.mapInstanceType(
      options.instanceType ?? this.config.defaultInstanceType,
    );

    const koyebSandbox = await KoyebSandbox.create({
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

    const sandboxUrl = await koyebSandbox.get_sandbox_url();
    const id =
      koyebSandbox.id ?? sandboxUrl.split("/").pop() ?? crypto.randomUUID();

    return new KoyebSandboxImpl(id, koyebSandbox);
  }

  async listSandboxes(_tags?: Record<string, string>): Promise<SandboxInfo[]> {
    console.warn(
      "listSandboxes not fully supported in Koyeb SDK - returning empty list",
    );
    return [];
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const koyebSandbox = await KoyebSandbox.get_from_id(
        sandboxId,
        this.config.apiToken,
      );
      return new KoyebSandboxImpl(sandboxId, koyebSandbox);
    } catch {
      return null;
    }
  }

  async getSandboxByName(_name: string): Promise<Sandbox | null> {
    console.warn("getSandboxByName not supported in Koyeb SDK");
    return null;
  }
}
