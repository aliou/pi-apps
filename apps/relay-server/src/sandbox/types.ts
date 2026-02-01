import type { Readable, Writable } from "node:stream";

export type SandboxStatus =
  | "creating"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

export interface SandboxHandle {
  readonly sessionId: string;
  readonly status: SandboxStatus;

  /** Container ID (Docker-specific) */
  readonly containerId?: string;

  /** Image digest for reproducibility (e.g., "sha256:abc123...") */
  readonly imageDigest?: string;

  /** Streams to pi running inside sandbox */
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr?: Readable;

  /** Terminate the sandbox */
  terminate(): Promise<void>;

  /** Pause the sandbox (Docker: docker pause) */
  pause?(): Promise<void>;

  /** Resume a paused sandbox */
  resume?(): Promise<void>;

  /** Subscribe to status changes */
  onStatusChange(handler: (status: SandboxStatus) => void): () => void;
}

export interface CreateSandboxOptions {
  sessionId: string;

  /** Environment variables to pass to container */
  env?: Record<string, string>;

  /** Git repo to clone into workspace (optional) */
  repoUrl?: string;
  repoBranch?: string;

  /** Resource limits */
  resources?: {
    cpuShares?: number; // Relative CPU weight (default: 1024)
    memoryMB?: number; // Memory limit in MB (default: 2048)
  };

  /** Timeout settings */
  timeoutSec?: number; // Max container lifetime
}

export interface SandboxProvider {
  readonly name: string;

  /** Check if provider is available (Docker running, etc.) */
  isAvailable(): Promise<boolean>;

  /** Create a new sandbox */
  createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle>;

  /** Get existing sandbox by session ID */
  getSandbox(sessionId: string): SandboxHandle | undefined;

  /** Remove a sandbox from the provider's tracking */
  removeSandbox(sessionId: string): void;

  /** List all active sandboxes (optional, not all providers support this) */
  listSandboxes?(): Promise<SandboxInfo[]>;

  /** Cleanup: remove stopped containers, unused volumes (optional) */
  cleanup?(): Promise<CleanupResult>;
}

export interface SandboxInfo {
  sessionId: string;
  containerId: string;
  status: SandboxStatus;
  createdAt: string;
  volumeName: string;
}

export interface CleanupResult {
  containersRemoved: number;
  volumesRemoved: number;
}
