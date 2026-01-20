/**
 * Modal sandbox provider implementation.
 *
 * Uses the Modal JavaScript SDK to create and manage sandboxes.
 * @see https://modal.com/docs/guide/sdk-javascript-go
 * @see https://github.com/modal-labs/libmodal
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
  INSTANCE_SPECS,
} from "./types.js";

// Modal SDK types (these would come from the "modal" npm package)
// We define interfaces here to avoid hard dependency during development
interface ModalClient {
  apps: {
    fromName(
      name: string,
      options?: { createIfMissing?: boolean },
    ): Promise<ModalApp>;
  };
  sandboxes: {
    create(
      app: ModalApp,
      image: ModalImage,
      options?: ModalSandboxOptions,
    ): Promise<ModalSandbox>;
    fromId(sandboxId: string): Promise<ModalSandbox>;
    fromName(name: string, app: ModalApp): Promise<ModalSandbox | null>;
    list(options?: { tags?: Record<string, string> }): AsyncIterable<ModalSandboxInfo>;
  };
  images: {
    fromRegistry(image: string): ModalImage;
  };
  secrets: {
    fromDict(dict: Record<string, string>): ModalSecret;
  };
}

interface ModalApp {
  name: string;
}

interface ModalImage {
  pipInstall(packages: string[]): ModalImage;
  runCommands(commands: string[]): ModalImage;
}

interface ModalSecret {}

interface ModalSandboxOptions {
  secrets?: ModalSecret[];
  timeout?: number;
  idleTimeout?: number;
  cpu?: number;
  memory?: number;
  name?: string;
  tags?: Record<string, string>;
}

interface ModalSandbox {
  objectId: string;
  exec(
    args: string[],
    options?: { timeout?: number; cwd?: string },
  ): Promise<ModalSandboxProcess>;
  terminate(): Promise<void>;
}

interface ModalSandboxProcess {
  stdout: ModalStream;
  stderr: ModalStream;
  wait(): Promise<number>;
}

interface ModalStream {
  readText(): Promise<string>;
  [Symbol.asyncIterator](): AsyncIterator<string>;
}

interface ModalSandboxInfo {
  objectId: string;
  name?: string;
  tags?: Record<string, string>;
  createdAt: Date;
}

/**
 * Get the Modal client (lazy loaded).
 */
async function getModalClient(): Promise<ModalClient> {
  try {
    // Dynamic import to avoid bundling issues
    // @ts-expect-error - modal package is optional, types defined above
    const modal = await import("modal");
    return new modal.ModalClient() as unknown as ModalClient;
  } catch (error) {
    throw new Error(
      `Failed to load Modal SDK. Ensure "modal" is installed: npm install modal. Error: ${error}`,
    );
  }
}

/**
 * Modal sandbox implementation.
 */
class ModalSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private modalSandbox: ModalSandbox;
  private client: ModalClient;
  private exposedPorts: Map<number, string> = new Map();

  constructor(id: string, modalSandbox: ModalSandbox, client: ModalClient) {
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
      createdAt: new Date(), // Modal doesn't expose this easily
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

    // Read stdout and stderr
    const [stdout, stderr, exitCode] = await Promise.all([
      process.stdout.readText(),
      process.stderr.readText(),
      process.wait(),
    ]);

    // Call callbacks if provided
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

    // Stream stdout and stderr concurrently
    const stdoutIterator = process.stdout[Symbol.asyncIterator]();
    const stderrIterator = process.stderr[Symbol.asyncIterator]();

    // Create a merged async generator
    const pending: Promise<{ stream: "stdout" | "stderr"; result: IteratorResult<string> }>[] = [];

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

        // Refresh the iterator
        const idx = pending.findIndex(
          (p) => p.then((r) => r.stream === stream),
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
        // Remove completed iterator
        const idx = pending.findIndex(
          (p) => p.then((r) => r.stream === stream),
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

    // Use shell to write file (base64 encode for safety)
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
    // Modal sandboxes can expose ports via tunnel
    // For now, we'll use the sandbox's built-in TCP tunneling
    // The actual implementation depends on Modal's tunnel API
    const tunnelUrl = `sandbox-${this.id}-${port}.modal.run`;
    this.exposedPorts.set(port, tunnelUrl);
    return tunnelUrl;
  }

  async connect(port: number): Promise<SandboxConnection> {
    // Modal sandbox TCP connections
    // This is a placeholder - actual implementation depends on Modal's API
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
  private client: ModalClient | null = null;
  private config: SandboxProviderConfig;
  private app: ModalApp | null = null;
  private appName: string;

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "modal") {
      throw new Error(`Invalid provider: ${config.provider}, expected "modal"`);
    }
    this.config = config;
    this.appName =
      (config.providerConfig?.appName as string) ?? "pi-server-sandboxes";

    // Set environment variables for Modal authentication
    if (config.apiToken) {
      // Modal expects MODAL_TOKEN_ID and MODAL_TOKEN_SECRET
      // or a combined token that can be parsed
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
  }

  private async ensureClient(): Promise<ModalClient> {
    if (!this.client) {
      this.client = await getModalClient();
    }
    return this.client;
  }

  private async ensureApp(): Promise<ModalApp> {
    if (!this.app) {
      const client = await this.ensureClient();
      this.app = await client.apps.fromName(this.appName, {
        createIfMissing: true,
      });
    }
    return this.app;
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const client = await this.ensureClient();
    const app = await this.ensureApp();

    // Create image
    let image = client.images.fromRegistry(
      options.image ?? this.config.defaultImage ?? "python:3.12-slim",
    );

    // Add pip packages if specified in provider config
    const pipPackages = this.config.providerConfig?.pipPackages as
      | string[]
      | undefined;
    if (pipPackages && pipPackages.length > 0) {
      image = image.pipInstall(pipPackages);
    }

    // Create secrets from environment variables
    const secrets = options.env
      ? [client.secrets.fromDict(options.env)]
      : undefined;

    // Map instance type to resources
    const instanceType =
      options.instanceType ?? this.config.defaultInstanceType ?? "small";
    const specs = {
      nano: { vcpu: 0.5, memoryMB: 512 },
      small: { vcpu: 1, memoryMB: 1024 },
      medium: { vcpu: 2, memoryMB: 2048 },
      large: { vcpu: 4, memoryMB: 4096 },
    }[instanceType];

    // Create sandbox
    const modalSandbox = await client.sandboxes.create(app, image, {
      secrets,
      timeout:
        (options.timeout ?? this.config.defaultTimeout ?? 5 * 60 * 1000) / 1000, // Modal uses seconds
      idleTimeout:
        (options.idleTimeout ?? this.config.defaultIdleTimeout ?? 60 * 1000) /
        1000,
      cpu: specs.vcpu,
      memory: specs.memoryMB * 1024 * 1024, // Modal uses bytes
      name: options.name,
      tags: options.tags,
    });

    return new ModalSandboxImpl(modalSandbox.objectId, modalSandbox, client);
  }

  async listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]> {
    const client = await this.ensureClient();

    const sandboxes: SandboxInfo[] = [];
    for await (const info of client.sandboxes.list({ tags })) {
      sandboxes.push({
        id: info.objectId,
        status: "running", // Modal doesn't expose status in list
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
      const client = await this.ensureClient();
      const modalSandbox = await client.sandboxes.fromId(sandboxId);
      return new ModalSandboxImpl(sandboxId, modalSandbox, client);
    } catch {
      return null;
    }
  }

  async getSandboxByName(name: string): Promise<Sandbox | null> {
    try {
      const client = await this.ensureClient();
      const app = await this.ensureApp();
      const modalSandbox = await client.sandboxes.fromName(name, app);
      if (!modalSandbox) {
        return null;
      }
      return new ModalSandboxImpl(modalSandbox.objectId, modalSandbox, client);
    } catch {
      return null;
    }
  }
}
