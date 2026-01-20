/**
 * Modal sandbox provider implementation.
 *
 * Uses the Modal JavaScript SDK to create and manage sandboxes.
 * @see https://modal.com/docs/guide/sdk-javascript-go
 * @see https://github.com/modal-labs/libmodal
 *
 * Install: npm install modal
 */

import {
  type App,
  type Image,
  ModalClient,
  type Sandbox as ModalSandboxType,
} from "modal";
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
  private modalSandbox: ModalSandboxType;
  private exposedPorts: Map<number, string> = new Map();

  constructor(id: string, modalSandbox: ModalSandboxType) {
    this.id = id;
    this.modalSandbox = modalSandbox;
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
      timeoutMs: options?.timeout,
      workdir: options?.cwd,
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
      timeoutMs: options?.timeout,
      workdir: options?.cwd,
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

        const idx = pending.findIndex((p) =>
          p.then((r) => r.stream === stream),
        );
        if (idx >= 0) {
          pending.splice(idx, 1);
          if (stream === "stdout") {
            pending.push(nextStdout());
          } else {
            pending.push(nextStderr());
          }
        }
      } else {
        const idx = pending.findIndex((p) =>
          p.then((r) => r.stream === stream),
        );
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
  private app: App | null = null;
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

  private async ensureApp(): Promise<App> {
    if (!this.app) {
      this.app = await this.client.apps.fromName(this.appName, {
        createIfMissing: true,
      });
    }
    return this.app;
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const app = await this.ensureApp();

    let image: Image = this.client.images.fromRegistry(
      options.image ?? this.config.defaultImage ?? "python:3.12-slim",
    );

    // Use dockerfileCommands to install pip packages if needed
    const pipPackages = this.config.providerConfig?.pipPackages as
      | string[]
      | undefined;
    if (pipPackages && pipPackages.length > 0) {
      image = image.dockerfileCommands([
        `RUN pip install ${pipPackages.join(" ")}`,
      ]);
    }

    const secrets = options.env
      ? [await this.client.secrets.fromObject(options.env)]
      : undefined;

    const instanceType =
      options.instanceType ?? this.config.defaultInstanceType ?? "small";
    const specs = {
      nano: { cpu: 0.5, memoryMiB: 512 },
      small: { cpu: 1, memoryMiB: 1024 },
      medium: { cpu: 2, memoryMiB: 2048 },
      large: { cpu: 4, memoryMiB: 4096 },
    }[instanceType];

    const modalSandbox = await this.client.sandboxes.create(app, image, {
      secrets,
      timeoutMs: options.timeout ?? this.config.defaultTimeout ?? 5 * 60 * 1000,
      idleTimeoutMs:
        options.idleTimeout ?? this.config.defaultIdleTimeout ?? 60 * 1000,
      cpu: specs.cpu,
      memoryMiB: specs.memoryMiB,
      name: options.name,
    });

    // Set tags if provided
    if (options.tags) {
      await modalSandbox.setTags(options.tags);
    }

    return new ModalSandboxImpl(modalSandbox.sandboxId, modalSandbox);
  }

  async listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]> {
    const sandboxes: SandboxInfo[] = [];
    for await (const sb of this.client.sandboxes.list({ tags })) {
      const sbTags = await sb.getTags();
      sandboxes.push({
        id: sb.sandboxId,
        status: "running",
        createdAt: new Date(),
        tags: sbTags,
        metadata: { provider: "modal" },
      });
    }

    return sandboxes;
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const modalSandbox = await this.client.sandboxes.fromId(sandboxId);
      return new ModalSandboxImpl(sandboxId, modalSandbox);
    } catch {
      return null;
    }
  }

  async getSandboxByName(name: string): Promise<Sandbox | null> {
    try {
      const modalSandbox = await this.client.sandboxes.fromName(
        this.appName,
        name,
      );
      return new ModalSandboxImpl(modalSandbox.sandboxId, modalSandbox);
    } catch {
      return null;
    }
  }
}
