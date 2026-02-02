import type { Readable, Writable } from "node:stream";

export type SandboxStatus =
  | "creating"
  | "running"
  | "paused"
  | "stopped"
  | "error";

/**
 * Persistable sandbox metadata. Can be stored in DB or returned from queries.
 */
export interface SandboxInfo {
  sessionId: string;
  /** Provider-specific identifier (container ID for Docker, instance ID for cloud) */
  providerId: string;
  status: SandboxStatus;
  imageDigest?: string;
  createdAt: string;
}

/**
 * Live I/O streams to the pi process inside a sandbox.
 * Returned by `SandboxHandle.attach()`.
 */
export interface SandboxStreams {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr?: Readable;

  /** Release streams without affecting the sandbox. */
  detach(): void;
}

/**
 * Reference to a sandbox with identity, status, and lifecycle methods.
 * Does not hold streams — call `attach()` to get them.
 */
export interface SandboxHandle {
  readonly sessionId: string;
  /** Provider-specific identifier (container ID for Docker) */
  readonly providerId: string;
  readonly status: SandboxStatus;
  /** Image digest for reproducibility (e.g., "sha256:abc123...") */
  readonly imageDigest?: string;

  /**
   * Ensure the sandbox is running.
   * - If running: no-op.
   * - If paused: resumes.
   * - If stopped: restarts.
   * - If creating: waits until ready.
   * - If gone/unrecoverable: throws.
   *
   * If secrets provided, refreshes the secrets files on the host
   * before resuming (bind mount makes them visible to the container).
   */
  resume(secrets?: Record<string, string>, githubToken?: string): Promise<void>;

  /**
   * Get live streams to the pi process.
   * Assumes the sandbox is running (call resume() first if needed).
   * Throws if not running.
   */
  attach(): Promise<SandboxStreams>;

  /** Freeze the sandbox (e.g., for idle timeout). */
  pause(): Promise<void>;

  /** Stop and remove the sandbox. */
  terminate(): Promise<void>;

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(handler: (status: SandboxStatus) => void): () => void;
}

export interface CreateSandboxOptions {
  sessionId: string;

  /** Environment variables to pass to container */
  env?: Record<string, string>;

  /** Secrets to inject (read fresh from DB at creation time) */
  secrets?: Record<string, string>;

  /** Git repo to clone into workspace (optional) */
  repoUrl?: string;
  repoBranch?: string;

  /** GitHub PAT for git push and private repo clone */
  githubToken?: string;

  /** Resource limits */
  resources?: {
    cpuShares?: number;
    memoryMB?: number;
  };

  /** Timeout settings */
  timeoutSec?: number;
}

export interface SandboxProvider {
  readonly name: string;

  /** Check if provider is available (Docker running, etc.) */
  isAvailable(): Promise<boolean>;

  /** Create a new sandbox. Returns handle with providerId for DB storage. */
  createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle>;

  /**
   * Get handle for an existing sandbox by provider-specific ID.
   * Checks real state (e.g., Docker API), not just in-memory cache.
   * Throws if sandbox doesn't exist or provider error.
   */
  getSandbox(providerId: string): Promise<SandboxHandle>;

  /** List all sandboxes (info only, no handles). */
  listSandboxes(): Promise<SandboxInfo[]>;

  /** Remove stopped/dead sandboxes and unused resources. */
  cleanup(): Promise<CleanupResult>;
}

export interface CleanupResult {
  containersRemoved: number;
  volumesRemoved: number;
}
