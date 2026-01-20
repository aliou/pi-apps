/**
 * Sandbox Session Manager
 *
 * Manages sessions that run in sandboxes instead of locally.
 * Each session gets its own sandbox where pi-server runs in RPC mode.
 * The gateway proxies WebSocket messages between clients and sandboxed pi-server instances.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { Sandbox, SandboxConnection, SandboxProvider } from "./types.js";
import type { SessionInfo, SessionMode } from "../types.js";

const PI_SERVER_PORT = 3141;
const SANDBOX_STARTUP_TIMEOUT = 120_000; // 2 minutes

/**
 * Configuration for sandbox sessions.
 */
export interface SandboxSessionConfig {
  /** Sandbox provider to use */
  provider: SandboxProvider;

  /** Docker image containing pi-server (default: "node:20-slim") */
  image?: string;

  /** Instance type for sandboxes */
  instanceType?: "nano" | "small" | "medium" | "large";

  /** Timeout for sandbox sessions (ms) */
  timeout?: number;

  /** Idle timeout before sandbox terminates (ms) */
  idleTimeout?: number;

  /** Environment variables to pass to sandboxes */
  env?: Record<string, string>;

  /** Path to pi-server in the image */
  piServerPath?: string;
}

/**
 * Active sandbox session.
 */
export interface SandboxSession {
  sessionId: string;
  sandboxId: string;
  sandbox: Sandbox;
  connection?: SandboxConnection;
  info: SessionInfo;
  status: "starting" | "running" | "stopping" | "stopped" | "error";
  error?: string;
}

/**
 * Event callback for session events.
 */
export type SandboxSessionEventCallback = (
  sessionId: string,
  event: AgentSessionEvent,
) => void;

/**
 * Manages sessions running in sandboxes.
 */
export class SandboxSessionManager {
  private config: SandboxSessionConfig;
  private sessions: Map<string, SandboxSession> = new Map();
  private eventCallback?: SandboxSessionEventCallback;
  private messageHandlers: Map<string, (data: string) => void> = new Map();

  constructor(config: SandboxSessionConfig) {
    this.config = config;
  }

  /**
   * Set callback for session events.
   */
  onEvent(callback: SandboxSessionEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Create a new sandboxed session.
   */
  async createSession(
    mode: SessionMode,
    repoId?: string,
    _preferredModel?: { provider: string; modelId: string },
    systemPrompt?: string,
  ): Promise<SessionInfo> {
    const sessionId = crypto.randomUUID();

    // Build environment variables for the sandbox
    const env: Record<string, string> = {
      ...this.config.env,
      PI_SESSION_ID: sessionId,
      PI_SESSION_MODE: mode,
    };

    if (repoId) {
      env.PI_REPO_ID = repoId;
    }

    if (systemPrompt) {
      env.PI_SYSTEM_PROMPT = systemPrompt;
    }

    // Pass through auth tokens
    if (process.env.GITHUB_TOKEN) {
      env.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    }
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    }
    if (process.env.GOOGLE_API_KEY) {
      env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    }

    const now = new Date().toISOString();
    const info: SessionInfo = {
      sessionId,
      mode,
      repoId: mode === "code" ? repoId : undefined,
      worktreePath: `/workspace/${sessionId}`, // Path inside sandbox
      createdAt: now,
      lastActivityAt: now,
    };

    // Create sandbox session entry (in starting state)
    const sandboxSession: SandboxSession = {
      sessionId,
      sandboxId: "", // Will be set after sandbox creation
      sandbox: null as unknown as Sandbox,
      info,
      status: "starting",
    };
    this.sessions.set(sessionId, sandboxSession);

    // Create sandbox asynchronously
    this.createSandboxAsync(sandboxSession, env).catch((error) => {
      console.error(`Failed to create sandbox for session ${sessionId}:`, error);
      sandboxSession.status = "error";
      sandboxSession.error = error.message;
    });

    return info;
  }

  /**
   * Create sandbox and start pi-server inside it.
   */
  private async createSandboxAsync(
    session: SandboxSession,
    env: Record<string, string>,
  ): Promise<void> {
    const { provider, image, instanceType, timeout, idleTimeout } = this.config;

    // Create sandbox
    const sandbox = await provider.createSandbox({
      image: image ?? "node:20-slim",
      instanceType: instanceType ?? "small",
      timeout: timeout ?? 30 * 60 * 1000, // 30 minutes default
      idleTimeout: idleTimeout ?? 5 * 60 * 1000, // 5 minutes idle
      env,
      name: `pi-session-${session.sessionId.slice(0, 8)}`,
      tags: {
        "pi-session": session.sessionId,
        "pi-mode": session.info.mode,
      },
    });

    session.sandbox = sandbox;
    session.sandboxId = sandbox.id;

    try {
      // Set up workspace
      await sandbox.mkdir("/workspace");
      await sandbox.mkdir("/workspace/data");

      // Clone repo if in code mode
      if (session.info.mode === "code" && session.info.repoId) {
        await this.cloneRepoInSandbox(sandbox, session.info.repoId, env);
      }

      // Install pi-server if needed
      const piServerPath = this.config.piServerPath ?? "npx pi-server";

      // Start pi-server in RPC mode
      console.log(`Starting pi-server in sandbox ${sandbox.id}...`);

      // Launch pi-server as background process
      const processId = await this.launchPiServer(sandbox, piServerPath, env);
      console.log(`Pi-server started with process ID: ${processId}`);

      // Wait for pi-server to be ready
      await this.waitForPiServer(sandbox);

      // Expose the port
      const exposedUrl = await sandbox.exposePort(PI_SERVER_PORT);
      console.log(`Pi-server exposed at: ${exposedUrl}`);

      // Connect to the sandbox
      const connection = await sandbox.connect(PI_SERVER_PORT);
      session.connection = connection;

      // Start receiving events
      this.startEventForwarding(session, connection);

      session.status = "running";
      console.log(`Session ${session.sessionId} is now running in sandbox ${sandbox.id}`);
    } catch (error) {
      session.status = "error";
      session.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Clone a repo inside the sandbox.
   */
  private async cloneRepoInSandbox(
    sandbox: Sandbox,
    repoId: string,
    env: Record<string, string>,
  ): Promise<void> {
    const githubToken = env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error("GITHUB_TOKEN required for code mode");
    }

    // Build authenticated clone URL
    const cloneUrl = `https://${githubToken}@github.com/${repoId}.git`;

    // Clone the repo
    const result = await sandbox.exec("git", [
      "clone",
      "--depth=1",
      cloneUrl,
      `/workspace/repo`,
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to clone repo: ${result.stderr}`);
    }

    console.log(`Cloned ${repoId} into sandbox`);
  }

  /**
   * Launch pi-server as a background process.
   */
  private async launchPiServer(
    sandbox: Sandbox,
    piServerPath: string,
    env: Record<string, string>,
  ): Promise<string> {
    // Determine working directory
    const cwd = env.PI_SESSION_MODE === "code" ? "/workspace/repo" : "/workspace";

    // Write a startup script
    const startupScript = `#!/bin/sh
cd ${cwd}
export PI_SERVER_DATA_DIR=/workspace/data
export PI_SERVER_PORT=${PI_SERVER_PORT}
exec ${piServerPath} --host 0.0.0.0
`;

    await sandbox.writeFile("/workspace/start-pi.sh", startupScript);
    await sandbox.exec("chmod", ["+x", "/workspace/start-pi.sh"]);

    // Run the startup script
    // Note: For Koyeb, we can use launch_process; for Modal, we run in background
    const result = await sandbox.exec("sh", [
      "-c",
      "nohup /workspace/start-pi.sh > /workspace/pi-server.log 2>&1 & echo $!",
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to start pi-server: ${result.stderr}`);
    }

    return result.stdout.trim();
  }

  /**
   * Wait for pi-server to be ready.
   */
  private async waitForPiServer(sandbox: Sandbox): Promise<void> {
    const startTime = Date.now();
    const timeout = SANDBOX_STARTUP_TIMEOUT;

    while (Date.now() - startTime < timeout) {
      try {
        const result = await sandbox.exec("curl", [
          "-s",
          "-o",
          "/dev/null",
          "-w",
          "%{http_code}",
          `http://localhost:${PI_SERVER_PORT}/health`,
        ]);

        if (result.stdout.trim() === "200") {
          return;
        }
      } catch {
        // Ignore errors, keep trying
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Pi-server did not start within ${timeout / 1000} seconds`);
  }

  /**
   * Start forwarding events from sandbox to the event callback.
   */
  private startEventForwarding(
    session: SandboxSession,
    connection: SandboxConnection,
  ): void {
    (async () => {
      try {
        for await (const message of connection.receive()) {
          this.handleSandboxMessage(session.sessionId, message);
        }
      } catch (error) {
        console.error(
          `Event forwarding error for session ${session.sessionId}:`,
          error,
        );
        session.status = "error";
        session.error =
          error instanceof Error ? error.message : String(error);
      }
    })();
  }

  /**
   * Handle a message from the sandbox.
   */
  private handleSandboxMessage(sessionId: string, data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if it's an event
      if (message.kind === "event" && this.eventCallback) {
        // Transform to AgentSessionEvent format
        const event: AgentSessionEvent = {
          type: message.type,
          ...message.payload,
        };
        this.eventCallback(sessionId, event);
        return;
      }

      // Check if it's a response to a pending request
      if (message.kind === "response" && message.id) {
        const handler = this.messageHandlers.get(message.id);
        if (handler) {
          handler(data);
          this.messageHandlers.delete(message.id);
        }
      }
    } catch (error) {
      console.error(`Failed to parse sandbox message:`, error);
    }
  }

  /**
   * Send a request to a sandboxed session and get response.
   */
  async sendRequest<T>(
    sessionId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "running" || !session.connection) {
      throw new Error(`Session not ready: ${session.status}`);
    }

    const requestId = crypto.randomUUID();
    const request = {
      v: 1,
      kind: "request",
      id: requestId,
      sessionId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      // Set up response handler
      const timeoutId = setTimeout(() => {
        this.messageHandlers.delete(requestId);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);

      this.messageHandlers.set(requestId, (data) => {
        clearTimeout(timeoutId);
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            resolve(response.result as T);
          } else {
            reject(
              new Error(response.error?.message ?? "Request failed"),
            );
          }
        } catch (error) {
          reject(error);
        }
      });

      // Send request
      session.connection!.send(JSON.stringify(request)).catch((error) => {
        clearTimeout(timeoutId);
        this.messageHandlers.delete(requestId);
        reject(error);
      });
    });
  }

  /**
   * Send a request without waiting for response.
   */
  async sendRequestNoWait(
    sessionId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== "running" || !session.connection) {
      throw new Error(`Session not ready: ${session.status}`);
    }

    const request = {
      v: 1,
      kind: "request",
      id: crypto.randomUUID(),
      sessionId,
      method,
      params,
    };

    await session.connection.send(JSON.stringify(request));
  }

  /**
   * Get a session.
   */
  getSession(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions.
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info);
  }

  /**
   * Check if a session is ready for requests.
   */
  isSessionReady(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === "running" && !!session.connection;
  }

  /**
   * Wait for a session to be ready.
   */
  async waitForSession(
    sessionId: string,
    timeout = SANDBOX_STARTUP_TIMEOUT,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.status === "running") {
        return;
      }

      if (session.status === "error") {
        throw new Error(`Session error: ${session.error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Session did not start within ${timeout / 1000} seconds`);
  }

  /**
   * Delete a session and its sandbox.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.status = "stopping";

    try {
      // Close connection
      if (session.connection) {
        await session.connection.close();
      }

      // Terminate sandbox
      if (session.sandbox) {
        await session.sandbox.terminate();
      }
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
    }

    session.status = "stopped";
    this.sessions.delete(sessionId);
  }

  /**
   * Clean up all sessions.
   */
  async dispose(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map((id) => this.deleteSession(id)));
  }
}
