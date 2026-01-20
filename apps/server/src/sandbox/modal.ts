/**
 * Modal sandbox provider implementation.
 *
 * Uses the Modal JavaScript SDK to create and manage sandboxes.
 * @see https://modal.com/docs/guide/sdk-javascript-go
 * @see https://github.com/modal-labs/libmodal
 *
 * Install: npm install modal
 */

import { ModalClient } from "modal";
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
 * Modal sandbox implementation.
 */
class ModalSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private modalSandbox: any;
  private client: ModalClient;
  private exposedPorts: Map<number, string> = new Map();

  constructor(id: string, modalSandbox: any, client: ModalClient) {
    this.id = id;
    this.modalSandbox = modalSandbox;
    this.client = client;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async getInfo(): Promise<SandboxInfo> {
    return {
      id: this.id,
      status: this._status,
      createdAt: new Date(),
      metadata: {
        provider: "modal",
      },
    };
  }

  async exec(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const fullArgs = [command, ...args];
    const process = await this.modalSandbox.exec(fullArgs, {
      timeout: options?.timeout ? options.timeout / 1000 : undefined,
      cwd: options?.cwd,
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      process.stdout.readText(),
      process.stderr.readText(),
      process.wait(),
    ]);

    if (options?.onStdout && stdout) {
      options.onStdout(stdout);
    }
    if (options?.onStderr && stderr) {
      options.onStderr(stderr);
    }

    return {
      exitCode,
      stdout,
      stderr,
    };
  }

  async *execStream(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): AsyncGenerator<ExecOutput> {
    const fullArgs = [command, ...args];
    const process = await this.modalSandbox.exec(fullArgs, {
      timeout: options?.timeout ? options.timeout / 1000 : undefined,
      cwd: options?.cwd,
    });

    const stdoutIterator = process.stdout[Symbol.asyncIterator]();
    const stderrIterator = process.stderr[Symbol.asyncIterator]();

    const pending: Promise<{
      stream: "stdout" | "stderr";
      result: IteratorResult<string>;
    }>[] = [];

    const nextStdout = async () => ({
      stream: "stdout" as const,
      result: await stdoutIterator.next(),
    });
    const nextStderr = async () => ({
      stream: "stderr" as const,
      result: await stderrIterator.next(),
    });

    pending.push(nextStdout());
    pending.push(nextStderr());

    while (pending.length > 0) {
      const { stream, result } = await Promise.race(pending);

      if (!result.done) {
        yield { stream, data: result.value };

        const idx = pending.findIndex((p) => p.then((r) => r.stream === stream));
        if (idx >= 0) {
          pending.splice(idx, 1);
          if (stream === "stdout") {
            pending.push(nextStdout());
          } else {
            pending.push(nextStderr());
          }
        }
      } else {
        const idx = pending.findIndex((p) => p.then((r) => r.stream === stream));
        if (idx >= 0) {
          pending.splice(idx, 1);
        }
      }
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const contentStr =
      typeof content === "string" ? content : new TextDecoder().decode(content);

    const base64Content = Buffer.from(contentStr).toString("base64");
    await this.exec("sh", [
      "-c",
      `echo '${base64Content}' | base64 -d > '${path}'`,
    ]);
  }

  async readFile(path: string): Promise<string> {
    const result = await this.exec("cat", [path]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
    return result.stdout;
  }

  async mkdir(path: string, recursive = true): Promise<void> {
    const args = recursive ? ["-p", path] : [path];
    const result = await this.exec("mkdir", args);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory ${path}: ${result.stderr}`);
    }
  }

  async exposePort(port: number): Promise<string> {
    const tunnelUrl = `sandbox-${this.id}-${port}.modal.run`;
    this.exposedPorts.set(port, tunnelUrl);
    return tunnelUrl;
  }

  async connect(_port: number): Promise<SandboxConnection> {
    throw new Error(
      "Direct TCP connections not yet implemented for Modal sandboxes. " +
        "Use execStream for command-based communication.",
    );
  }

  async terminate(): Promise<void> {
    this._status = "stopping";
    try {
      await this.modalSandbox.terminate();
      this._status = "stopped";
    } catch (error) {
      this._status = "error";
      throw error;
    }
  }
}

/**
 * Modal sandbox provider.
 */
export class ModalSandboxProvider implements SandboxProvider {
  readonly name = "modal";
  private client: ModalClient;
  private config: SandboxProviderConfig;
  private app: any | null = null;
  private appName: string;

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "modal") {
      throw new Error(`Invalid provider: ${config.provider}, expected "modal"`);
    }
    this.config = config;
    this.appName =
      (config.providerConfig?.appName as string) ?? "pi-server-sandboxes";

    if (config.apiToken) {
      const [tokenId, tokenSecret] = config.apiToken.includes(":")
        ? config.apiToken.split(":")
        : [config.apiToken, ""];

      if (tokenId) {
        process.env.MODAL_TOKEN_ID = tokenId;
      }
      if (tokenSecret) {
        process.env.MODAL_TOKEN_SECRET = tokenSecret;
      }
    }

    this.client = new ModalClient();
  }

  private async ensureApp(): Promise<any> {
    if (!this.app) {
      this.app = await this.client.apps.fromName(this.appName, {
        createIfMissing: true,
      });
    }
    return this.app;
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const app = await this.ensureApp();

    let image = this.client.images.fromRegistry(
      options.image ?? this.config.defaultImage ?? "python:3.12-slim",
    );

    const pipPackages = this.config.providerConfig?.pipPackages as
      | string[]
      | undefined;
    if (pipPackages && pipPackages.length > 0) {
      image = image.pipInstall(pipPackages);
    }

    const secrets = options.env
      ? [this.client.secrets.fromDict(options.env)]
      : undefined;

    const instanceType =
      options.instanceType ?? this.config.defaultInstanceType ?? "small";
    const specs = {
      nano: { vcpu: 0.5, memoryMB: 512 },
      small: { vcpu: 1, memoryMB: 1024 },
      medium: { vcpu: 2, memoryMB: 2048 },
      large: { vcpu: 4, memoryMB: 4096 },
    }[instanceType];

    const modalSandbox = await this.client.sandboxes.create(app, image, {
      secrets,
      timeout:
        (options.timeout ?? this.config.defaultTimeout ?? 5 * 60 * 1000) / 1000,
      idleTimeout:
        (options.idleTimeout ?? this.config.defaultIdleTimeout ?? 60 * 1000) /
        1000,
      cpu: specs.vcpu,
      memory: specs.memoryMB * 1024 * 1024,
      name: options.name,
      tags: options.tags,
    });

    return new ModalSandboxImpl(modalSandbox.objectId, modalSandbox, this.client);
  }

  async listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]> {
    const sandboxes: SandboxInfo[] = [];
    for await (const info of this.client.sandboxes.list({ tags })) {
      sandboxes.push({
        id: info.objectId,
        status: "running",
        createdAt: info.createdAt,
        name: info.name,
        tags: info.tags,
        metadata: { provider: "modal" },
      });
    }

    return sandboxes;
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const modalSandbox = await this.client.sandboxes.fromId(sandboxId);
      return new ModalSandboxImpl(sandboxId, modalSandbox, this.client);
    } catch {
      return null;
    }
  }

  async getSandboxByName(name: string): Promise<Sandbox | null> {
    try {
      const app = await this.ensureApp();
      const modalSandbox = await this.client.sandboxes.fromName(name, app);
      if (!modalSandbox) {
        return null;
      }
      return new ModalSandboxImpl(
        modalSandbox.objectId,
        modalSandbox,
        this.client,
      );
    } catch {
      return null;
    }
  }
}
