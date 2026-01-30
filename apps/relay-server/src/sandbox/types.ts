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

  /** Streams to pi running inside sandbox */
  readonly stdin: Writable;
  readonly stdout: Readable;

  /** Terminate the sandbox */
  terminate(): Promise<void>;

  /** Subscribe to status changes */
  onStatusChange(handler: (status: SandboxStatus) => void): () => void;
}

export interface CreateSandboxOptions {
  sessionId: string;
  env?: Record<string, string>;
}

export interface SandboxProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle>;
  getSandbox(sessionId: string): SandboxHandle | undefined;
  removeSandbox(sessionId: string): void;
}
