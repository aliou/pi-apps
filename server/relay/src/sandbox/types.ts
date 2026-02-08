import type { SandboxResourceTier } from "./provider-types";

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
 * Transport-neutral, message-oriented channel to the pi process inside a sandbox.
 *
 * Each "message" is a complete JSON line (no framing concerns for the consumer).
 * For Docker, an adapter splits the stdout stream into lines internally.
 * For WebSocket-based transports, each frame is already a message.
 *
 * Returned by `SandboxHandle.attach()`.
 */
export interface SandboxChannel {
  /**
   * Send a message (JSON line) to the pi process.
   * The channel handles framing (e.g., appending newline for stdin-based transports).
   */
  send(message: string): void;

  /**
   * Subscribe to messages from the pi process.
   * Each message is a complete JSON line (no trailing newline).
   * Returns an unsubscribe function.
   */
  onMessage(handler: (message: string) => void): () => void;

  /**
   * Subscribe to channel close events.
   * Fired when the underlying transport closes (process exit, WS disconnect, etc.).
   * Returns an unsubscribe function.
   */
  onClose(handler: (reason?: string) => void): () => void;

  /**
   * Close the channel and release resources.
   * Does not affect the sandbox itself (it keeps running).
   */
  close(): void;
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
   * Get a message-oriented channel to the pi process.
   * Assumes the sandbox is running (call resume() first if needed).
   * Throws if not running.
   */
  attach(): Promise<SandboxChannel>;

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

  /** Provider-neutral resource tier. Provider maps to specific limits. */
  resourceTier?: SandboxResourceTier;

  /** Timeout settings */
  timeoutSec?: number;

  /**
   * Enable native tools bridge extension in the sandbox.
   * When true, the provider loads the native-bridge extension which asks
   * connected clients for tool definitions via extension_ui_request.
   * Supported by Docker (bind mount) and Cloudflare (baked into image).
   */
  nativeToolsEnabled?: boolean;
}

/**
 * Declares what a sandbox provider can and cannot do.
 * Used by session service / idle timeout logic to decide behavior
 * (e.g., skip pause for lossy providers, trigger backup instead).
 */
export interface SandboxProviderCapabilities {
  /** Whether pause/resume preserves full process state (Docker: true, cloud: false). */
  losslessPause: boolean;

  /** Whether workspace files survive sandbox destruction without explicit backup. */
  persistentDisk: boolean;
}

export interface SandboxProvider {
  readonly name: string;
  readonly capabilities: SandboxProviderCapabilities;

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
  sandboxesRemoved: number;
  artifactsRemoved: number;
}
