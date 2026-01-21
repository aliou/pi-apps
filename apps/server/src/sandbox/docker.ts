/**
 * Docker sandbox provider implementation.
 *
 * Uses Docker to run sandboxes locally via the dockerode package.
 * Ideal for local development and testing without requiring remote services.
 *
 * @see https://github.com/apocas/dockerode
 *
 * Install: npm install dockerode @types/dockerode
 *
 * Requirements:
 * - Docker daemon running locally
 * - Docker socket accessible (usually /var/run/docker.sock)
 */

import { Writable } from "node:stream";
import type {
  Container,
  ContainerCreateOptions,
  ExecCreateOptions,
} from "dockerode";
import Docker from "dockerode";
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
 * Docker sandbox implementation.
 */
class DockerSandboxImpl implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "running";
  private container: Container;
  private docker: Docker;
  private exposedPorts: Map<number, string> = new Map();
  private createdAt: Date;
  private containerName: string;

  constructor(
    id: string,
    container: Container,
    docker: Docker,
    containerName: string,
  ) {
    this.id = id;
    this.container = container;
    this.docker = docker;
    this.containerName = containerName;
    this.createdAt = new Date();
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async getInfo(): Promise<SandboxInfo> {
    try {
      const info = await this.container.inspect();
      this._status = this.mapStatus(info.State?.Status ?? "unknown");
      return {
        id: this.id,
        status: this._status,
        createdAt: new Date(info.Created ?? this.createdAt),
        name: this.containerName,
        metadata: {
          provider: "docker",
          containerId: info.Id,
          image: info.Config?.Image,
        },
      };
    } catch {
      this._status = "error";
      return {
        id: this.id,
        status: this._status,
        createdAt: this.createdAt,
        name: this.containerName,
        metadata: { provider: "docker" },
      };
    }
  }

  private mapStatus(status: string): SandboxStatus {
    switch (status.toLowerCase()) {
      case "created":
        return "creating";
      case "running":
        return "running";
      case "paused":
      case "restarting":
        return "running";
      case "removing":
      case "exited":
      case "dead":
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
    const cmd = args.length > 0 ? [command, ...args] : [command];

    const execOptions: ExecCreateOptions = {
      Cmd: ["sh", "-c", cmd.join(" ")],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.cwd,
      Env: options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
    };

    const exec = await this.container.exec(execOptions);
    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      // Docker multiplexes stdout/stderr in the stream
      // We need to demux it
      const stdoutStream = new Writable({
        write(chunk, _encoding, callback) {
          const data = chunk.toString();
          stdout += data;
          if (options?.onStdout) {
            options.onStdout(data);
          }
          callback();
        },
      });

      const stderrStream = new Writable({
        write(chunk, _encoding, callback) {
          const data = chunk.toString();
          stderr += data;
          if (options?.onStderr) {
            options.onStderr(data);
          }
          callback();
        },
      });

      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      stream.on("end", async () => {
        try {
          const inspectResult = await exec.inspect();
          resolve({
            exitCode: inspectResult.ExitCode ?? 0,
            stdout,
            stderr,
          });
        } catch (err) {
          reject(err);
        }
      });

      stream.on("error", reject);

      // Handle timeout
      if (options?.timeout) {
        setTimeout(() => {
          stream.destroy();
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }
    });
  }

  async *execStream(
    command: string,
    args: string[] = [],
    options?: ExecOptions,
  ): AsyncGenerator<ExecOutput> {
    const cmd = args.length > 0 ? [command, ...args] : [command];

    const execOptions: ExecCreateOptions = {
      Cmd: ["sh", "-c", cmd.join(" ")],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: options?.cwd,
      Env: options?.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
    };

    const exec = await this.container.exec(execOptions);
    const stream = await exec.start({ hijack: true, stdin: false });

    const outputs: ExecOutput[] = [];
    let done = false;
    let resolveNext: ((result: IteratorResult<ExecOutput>) => void) | null =
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
        const resolve = resolveNext;
        resolveNext = null;
        resolve({ done: true, value: undefined });
      }
    };

    // Demux stdout/stderr
    const stdoutStream = new Writable({
      write(chunk, _encoding, callback) {
        const data = chunk.toString();
        enqueue({ stream: "stdout", data });
        if (options?.onStdout) {
          options.onStdout(data);
        }
        callback();
      },
    });

    const stderrStream = new Writable({
      write(chunk, _encoding, callback) {
        const data = chunk.toString();
        enqueue({ stream: "stderr", data });
        if (options?.onStderr) {
          options.onStderr(data);
        }
        callback();
      },
    });

    this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    stream.on("end", () => {
      finish();
    });

    stream.on("error", () => {
      finish();
    });

    // Handle timeout
    if (options?.timeout) {
      setTimeout(() => {
        stream.destroy();
        finish();
      }, options.timeout);
    }

    while (!done || outputs.length > 0) {
      if (outputs.length > 0) {
        const output = outputs.shift();
        if (output) yield output;
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

    // Use echo with base64 encoding to handle special characters
    const base64Content = Buffer.from(contentStr).toString("base64");

    // Ensure directory exists and write file
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir) {
      await this.exec("mkdir", ["-p", dir]);
    }

    const result = await this.exec("sh", [
      "-c",
      `echo '${base64Content}' | base64 -d > '${path}'`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file ${path}: ${result.stderr}`);
    }
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
    // For Docker, we need to check if the port was exposed at container creation
    // If not, we can't dynamically expose ports (Docker limitation)
    const cached = this.exposedPorts.get(port);
    if (cached) return cached;

    // Check container's port bindings
    const info = await this.container.inspect();
    const portBindings = info.NetworkSettings?.Ports ?? {};
    const portKey = `${port}/tcp`;

    if (portBindings[portKey] && portBindings[portKey].length > 0) {
      const binding = portBindings[portKey][0];
      const url = `http://${binding.HostIp === "0.0.0.0" ? "localhost" : binding.HostIp}:${binding.HostPort}`;
      this.exposedPorts.set(port, url);
      return url;
    }

    // If port wasn't exposed at creation, return localhost with container port
    // This will only work if accessing from the Docker network
    const url = `http://localhost:${port}`;
    this.exposedPorts.set(port, url);
    return url;
  }

  async connect(port: number): Promise<SandboxConnection> {
    // Get or expose the port first
    let url = this.exposedPorts.get(port);
    if (!url) {
      url = await this.exposePort(port);
    }

    // For Docker, we use WebSocket connection to the exposed port
    const wsUrl = url.replace(/^http/, "ws");

    return new DockerConnection(wsUrl);
  }

  async terminate(): Promise<void> {
    this._status = "stopping";
    try {
      await this.container.stop({ t: 5 });
      await this.container.remove({ force: true });
      this._status = "stopped";
    } catch (error) {
      this._status = "error";
      throw error;
    }
  }
}

/**
 * WebSocket connection to a Docker container.
 */
class DockerConnection implements SandboxConnection {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private _isOpen = false;
  private messageQueue: string[] = [];
  private resolvers: ((result: IteratorResult<string>) => void)[] = [];

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  private async ensureConnection(): Promise<WebSocket> {
    if (this.ws && this._isOpen) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
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
 * Docker sandbox provider.
 *
 * Creates and manages Docker containers as sandboxes. Ideal for local
 * development and testing without requiring remote services.
 */
export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private docker: Docker;
  private config: SandboxProviderConfig;
  private labelPrefix = "pi-server-sandbox";

  constructor(config: SandboxProviderConfig) {
    if (config.provider !== "docker") {
      throw new Error(
        `Invalid provider: ${config.provider}, expected "docker"`,
      );
    }

    this.config = config;

    // Initialize Docker client
    const dockerConfig: Docker.DockerOptions = {};

    // Support custom Docker socket path via providerConfig
    const socketPath = config.providerConfig?.socketPath as string | undefined;
    if (socketPath) {
      dockerConfig.socketPath = socketPath;
    }

    // Support Docker host via providerConfig or environment
    const dockerHost =
      (config.providerConfig?.host as string | undefined) ??
      process.env.DOCKER_HOST;
    if (dockerHost) {
      dockerConfig.host = dockerHost;
    }

    this.docker = new Docker(dockerConfig);
  }

  async createSandbox(options: SandboxCreateOptions): Promise<Sandbox> {
    const instanceType =
      options.instanceType ?? this.config.defaultInstanceType ?? "small";

    // Map instance type to Docker resource constraints
    const specs = {
      nano: { cpus: 0.5, memory: 512 * 1024 * 1024 },
      small: { cpus: 1, memory: 1024 * 1024 * 1024 },
      medium: { cpus: 2, memory: 2048 * 1024 * 1024 },
      large: { cpus: 4, memory: 4096 * 1024 * 1024 },
    }[instanceType];

    const image = options.image ?? this.config.defaultImage ?? "node:20-slim";
    const containerName =
      options.name ??
      `${this.labelPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Pull image if not available locally
    try {
      await this.docker.getImage(image).inspect();
    } catch {
      console.log(`Pulling image: ${image}`);
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(image, {}, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          if (!stream) {
            reject(new Error("No stream returned from docker pull"));
            return;
          }
          this.docker.modem.followProgress(
            stream,
            (pullErr) => {
              if (pullErr) reject(pullErr);
              else resolve();
            },
            () => {},
          );
        });
      });
    }

    // Build container options
    const createOptions: ContainerCreateOptions = {
      Image: image,
      name: containerName,
      Cmd: ["sh", "-c", "tail -f /dev/null"], // Keep container running
      Env: options.env
        ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
        : undefined,
      Labels: {
        [`${this.labelPrefix}`]: "true",
        [`${this.labelPrefix}.name`]: options.name ?? containerName,
        ...(options.tags ?? {}),
      },
      HostConfig: {
        NanoCpus: Math.floor(specs.cpus * 1e9),
        Memory: specs.memory,
        AutoRemove: false,
      },
      WorkingDir: "/workspace",
    };

    // Create and start container
    const container = await this.docker.createContainer(createOptions);
    await container.start();

    // Create workspace directory
    const sandbox = new DockerSandboxImpl(
      container.id,
      container,
      this.docker,
      containerName,
    );
    await sandbox.mkdir("/workspace");

    // Set up auto-termination timeout if specified
    const timeout =
      options.timeout ?? this.config.defaultTimeout ?? 30 * 60 * 1000;
    if (timeout > 0) {
      setTimeout(async () => {
        try {
          await sandbox.terminate();
        } catch {
          // Container may already be stopped
        }
      }, timeout);
    }

    return sandbox;
  }

  async listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]> {
    const filters: Record<string, string[]> = {
      label: [`${this.labelPrefix}=true`],
    };

    // Add tag filters
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        filters.label.push(`${key}=${value}`);
      }
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters,
    });

    return containers.map((container) => ({
      id: container.Id,
      status: this.mapStatus(container.State),
      createdAt: new Date(container.Created * 1000),
      name: container.Names[0]?.replace(/^\//, "") ?? container.Id.slice(0, 12),
      tags: container.Labels,
      metadata: {
        provider: "docker",
        image: container.Image,
      },
    }));
  }

  private mapStatus(state: string): SandboxStatus {
    switch (state.toLowerCase()) {
      case "created":
        return "creating";
      case "running":
        return "running";
      case "paused":
      case "restarting":
        return "running";
      case "removing":
      case "exited":
      case "dead":
        return "stopped";
      default:
        return "error";
    }
  }

  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    try {
      const container = this.docker.getContainer(sandboxId);
      const info = await container.inspect();
      return new DockerSandboxImpl(
        sandboxId,
        container,
        this.docker,
        info.Name.replace(/^\//, ""),
      );
    } catch {
      return null;
    }
  }

  async getSandboxByName(name: string): Promise<Sandbox | null> {
    const filters: Record<string, string[]> = {
      label: [`${this.labelPrefix}=true`, `${this.labelPrefix}.name=${name}`],
    };

    const containers = await this.docker.listContainers({
      all: true,
      filters,
    });

    if (containers.length === 0) {
      return null;
    }

    const container = this.docker.getContainer(containers[0].Id);
    return new DockerSandboxImpl(
      containers[0].Id,
      container,
      this.docker,
      name,
    );
  }

  /**
   * Clean up all pi-server sandboxes.
   */
  async cleanupAll(): Promise<number> {
    const sandboxes = await this.listSandboxes();
    let cleaned = 0;

    for (const sandbox of sandboxes) {
      try {
        const container = this.docker.getContainer(sandbox.id);
        try {
          await container.stop({ t: 1 });
        } catch {
          // May already be stopped
        }
        await container.remove({ force: true });
        cleaned++;
      } catch {
        // Ignore errors during cleanup
      }
    }

    return cleaned;
  }
}
