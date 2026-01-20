/**
 * Sandbox abstraction types.
 *
 * Defines the interface for ephemeral compute environments that can run
 * pi-server instances in isolation. Implementations exist for Modal, Koyeb, and Cloudflare.
 */

/**
 * Options for creating a new sandbox.
 */
export interface SandboxCreateOptions {
  /** Container image to use (e.g., "python:3.12-slim", "node:20-slim") */
  image: string;

  /** Environment variables to pass to the sandbox */
  env: Record<string, string>;

  /** Instance type determining CPU/memory resources */
  instanceType?: SandboxInstanceType;

  /** Maximum lifetime in milliseconds (default: 5 minutes) */
  timeout?: number;

  /** Idle timeout in milliseconds - terminate after inactivity */
  idleTimeout?: number;

  /** Optional name for the sandbox (for retrieval) */
  name?: string;

  /** Optional metadata tags */
  tags?: Record<string, string>;
}

/**
 * Instance type options (normalized across providers).
 */
export type SandboxInstanceType = "nano" | "small" | "medium" | "large";

/**
 * Resource specifications per instance type.
 */
export const INSTANCE_SPECS: Record<
  SandboxInstanceType,
  { vcpu: number; memoryMB: number }
> = {
  nano: { vcpu: 0.5, memoryMB: 512 },
  small: { vcpu: 1, memoryMB: 1024 },
  medium: { vcpu: 2, memoryMB: 2048 },
  large: { vcpu: 4, memoryMB: 4096 },
};

/**
 * Sandbox status.
 */
export type SandboxStatus =
  | "creating"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Information about a sandbox instance.
 */
export interface SandboxInfo {
  /** Unique sandbox identifier */
  id: string;

  /** Current status */
  status: SandboxStatus;

  /** Creation timestamp */
  createdAt: Date;

  /** Optional name */
  name?: string;

  /** Metadata tags */
  tags?: Record<string, string>;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for executing a command in a sandbox.
 */
export interface ExecOptions {
  /** Working directory for the command */
  cwd?: string;

  /** Additional environment variables for this command */
  env?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Callback for stdout data */
  onStdout?: (data: string) => void;

  /** Callback for stderr data */
  onStderr?: (data: string) => void;
}

/**
 * Result of command execution.
 */
export interface ExecResult {
  /** Exit code (0 = success) */
  exitCode: number;

  /** Captured stdout */
  stdout: string;

  /** Captured stderr */
  stderr: string;
}

/**
 * Streaming output from command execution.
 */
export interface ExecOutput {
  /** Output stream (stdout or stderr) */
  stream: "stdout" | "stderr";

  /** Output data */
  data: string;
}

/**
 * A TCP connection to a port exposed by the sandbox.
 */
export interface SandboxConnection {
  /** Send data to the connection */
  send(data: string | Uint8Array): Promise<void>;

  /** Async iterator for receiving data */
  receive(): AsyncGenerator<string>;

  /** Close the connection */
  close(): Promise<void>;

  /** Whether the connection is open */
  readonly isOpen: boolean;
}

/**
 * A running sandbox instance.
 */
export interface Sandbox {
  /** Unique sandbox identifier */
  readonly id: string;

  /** Current status */
  readonly status: SandboxStatus;

  /** Get sandbox info */
  getInfo(): Promise<SandboxInfo>;

  /**
   * Execute a command and wait for completion.
   * @param command - Command to run
   * @param args - Command arguments
   * @param options - Execution options
   */
  exec(
    command: string,
    args?: string[],
    options?: ExecOptions,
  ): Promise<ExecResult>;

  /**
   * Execute a command and stream output.
   * @param command - Command to run
   * @param args - Command arguments
   * @param options - Execution options
   */
  execStream(
    command: string,
    args?: string[],
    options?: ExecOptions,
  ): AsyncGenerator<ExecOutput>;

  /**
   * Write a file to the sandbox filesystem.
   * @param path - Absolute path in the sandbox
   * @param content - File content
   */
  writeFile(path: string, content: string | Uint8Array): Promise<void>;

  /**
   * Read a file from the sandbox filesystem.
   * @param path - Absolute path in the sandbox
   */
  readFile(path: string): Promise<string>;

  /**
   * Create a directory in the sandbox.
   * @param path - Absolute path in the sandbox
   * @param recursive - Create parent directories if needed
   */
  mkdir(path: string, recursive?: boolean): Promise<void>;

  /**
   * Expose a port for external TCP connections.
   * @param port - Internal port to expose
   * @returns External URL or host:port to connect to
   */
  exposePort(port: number): Promise<string>;

  /**
   * Connect to an exposed port.
   * @param port - Internal port that was exposed
   */
  connect(port: number): Promise<SandboxConnection>;

  /**
   * Terminate the sandbox.
   */
  terminate(): Promise<void>;
}

/**
 * Provider for creating and managing sandboxes.
 */
export interface SandboxProvider {
  /** Provider name (e.g., "modal", "koyeb") */
  readonly name: string;

  /**
   * Create a new sandbox.
   * @param options - Sandbox configuration
   */
  createSandbox(options: SandboxCreateOptions): Promise<Sandbox>;

  /**
   * List all sandboxes (optionally filtered by tags).
   * @param tags - Optional tag filters
   */
  listSandboxes(tags?: Record<string, string>): Promise<SandboxInfo[]>;

  /**
   * Get a sandbox by ID.
   * @param sandboxId - Sandbox identifier
   */
  getSandbox(sandboxId: string): Promise<Sandbox | null>;

  /**
   * Get a sandbox by name (if named sandboxes are supported).
   * @param name - Sandbox name
   */
  getSandboxByName(name: string): Promise<Sandbox | null>;
}

/**
 * Configuration for sandbox providers.
 */
export interface SandboxProviderConfig {
  /** Provider type */
  provider: "modal" | "koyeb" | "cloudflare";

  /** API token/key for the provider */
  apiToken: string;

  /** Default image to use */
  defaultImage?: string;

  /** Default instance type */
  defaultInstanceType?: SandboxInstanceType;

  /** Default timeout in milliseconds */
  defaultTimeout?: number;

  /** Default idle timeout in milliseconds */
  defaultIdleTimeout?: number;

  /** Provider-specific configuration */
  providerConfig?: Record<string, unknown>;
}
