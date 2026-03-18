import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { SandboxLogStore } from "../log-store";
import type {
  SandboxChannel,
  SandboxHandle,
  SandboxSecretMaterial,
  SandboxStatus,
} from "../types";
import { LocalSandboxChannel } from "./channel";

export interface LocalSandboxHandleOptions {
  sessionId: string;
  providerId: string;
  piPath: string;
  workspacePath: string;
  env?: Record<string, string>;
  logStore?: SandboxLogStore | null;
  cleanupWorkspace?: (() => Promise<void>) | undefined;
}

export class LocalSandboxHandle implements SandboxHandle {
  readonly sessionId: string;
  readonly providerId: string;
  readonly imageDigest?: string;

  private _status: SandboxStatus = "stopped";
  private readonly statusHandlers = new Set<(status: SandboxStatus) => void>();
  private child: ChildProcessWithoutNullStreams | null = null;
  private channel: LocalSandboxChannel | null = null;
  private baseEnv: Record<string, string>;
  private readonly piPath: string;
  private readonly workspacePath: string;
  private readonly logStore: SandboxLogStore | null;
  private readonly cleanupWorkspace?: () => Promise<void>;

  constructor(options: LocalSandboxHandleOptions) {
    this.sessionId = options.sessionId;
    this.providerId = options.providerId;
    this.piPath = options.piPath;
    this.workspacePath = options.workspacePath;
    this.baseEnv = options.env ?? {};
    this.logStore = options.logStore ?? null;
    this.cleanupWorkspace = options.cleanupWorkspace;
  }

  get status(): SandboxStatus {
    return this._status;
  }

  async resume(
    secrets?: Record<string, string>,
    githubToken?: string,
    secretMaterial?: SandboxSecretMaterial,
  ): Promise<void> {
    if (this.child && this._status === "running") {
      return;
    }

    this.setStatus("creating");
    const mergedSecrets = secretMaterial?.directEnv ?? secrets ?? {};
    const env = {
      ...process.env,
      ...this.baseEnv,
      ...mergedSecrets,
      PI_SESSION_ID: this.sessionId,
      ...(githubToken ? { GH_TOKEN: githubToken } : {}),
    };

    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(this.piPath, ["--mode", "rpc", "--continue"], {
        cwd: this.workspacePath,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let settled = false;
      child.once("spawn", () => {
        this.child = child;
        this.attachStderr(child);
        this.setStatus("running");
        settled = true;
        resolvePromise();
      });
      child.once("error", (error) => {
        this.child = null;
        this.setStatus("error");
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      child.once("close", () => {
        this.child = null;
        this.channel = null;
        if (this._status !== "stopped") {
          this.setStatus("stopped");
        }
      });
    });
  }

  async attach(): Promise<SandboxChannel> {
    if (!this.child || this._status !== "running") {
      throw new Error("Local sandbox is not running");
    }
    this.channel?.close();
    this.channel = new LocalSandboxChannel(this.child);
    return this.channel;
  }

  async pause(): Promise<void> {
    if (!this.child) {
      this.setStatus("stopped");
      return;
    }
    const child = this.child;
    await new Promise<void>((resolve) => {
      child.once("close", () => resolve());
      child.kill("SIGTERM");
    });
    this.child = null;
    this.channel?.close();
    this.channel = null;
    this.setStatus("stopped");
  }

  async terminate(): Promise<void> {
    await this.pause();
    await this.cleanupWorkspace?.();
  }

  onStatusChange(handler: (status: SandboxStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  setBaseEnv(env: Record<string, string>): void {
    this.baseEnv = env;
  }

  private setStatus(status: SandboxStatus): void {
    this._status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }

  private attachStderr(child: ChildProcessWithoutNullStreams): void {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) {
          this.logStore?.append(this.sessionId, trimmed);
        }
      }
    });
  }
}
