/**
 * Unified Session Manager
 *
 * A facade that can operate in either local mode (using SessionManager)
 * or sandbox mode (using SandboxSessionManager). This allows the server
 * handlers to work with either mode transparently.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { SessionMode, SessionInfo } from "../types.js";
import { SessionManager, type ActiveSession } from "./manager.js";
import {
  SandboxSessionManager,
  type SandboxSession,
  type SandboxSessionConfig,
} from "../sandbox/manager.js";
import type { SandboxProvider } from "../sandbox/types.js";

/**
 * Configuration for unified session manager.
 */
export interface UnifiedSessionManagerConfig {
  /** Data directory for local sessions */
  dataDir: string;

  /** Sandbox provider (if provided, enables sandbox mode) */
  sandboxProvider?: SandboxProvider;

  /** Sandbox configuration */
  sandboxConfig?: Partial<SandboxSessionConfig>;
}

/**
 * Event callback type.
 */
export type SessionEventCallback = (
  sessionId: string,
  event: AgentSessionEvent,
) => void;

/**
 * Unified session manager that works in both local and sandbox modes.
 */
export class UnifiedSessionManager {
  private localManager: SessionManager | null = null;
  private sandboxManager: SandboxSessionManager | null = null;
  private mode: "local" | "sandbox";
  private eventCallback?: SessionEventCallback;

  constructor(config: UnifiedSessionManagerConfig) {
    if (config.sandboxProvider) {
      // Sandbox mode
      this.mode = "sandbox";
      this.sandboxManager = new SandboxSessionManager({
        provider: config.sandboxProvider,
        image: config.sandboxConfig?.image,
        instanceType: config.sandboxConfig?.instanceType,
        timeout: config.sandboxConfig?.timeout,
        idleTimeout: config.sandboxConfig?.idleTimeout,
        env: config.sandboxConfig?.env,
        piServerPath: config.sandboxConfig?.piServerPath,
      });
    } else {
      // Local mode
      this.mode = "local";
      this.localManager = new SessionManager(config.dataDir);
    }
  }

  /**
   * Get the current mode.
   */
  getMode(): "local" | "sandbox" {
    return this.mode;
  }

  /**
   * Set callback for session events.
   */
  onEvent(callback: SessionEventCallback): void {
    this.eventCallback = callback;

    if (this.localManager) {
      this.localManager.onEvent(callback);
    }
    if (this.sandboxManager) {
      this.sandboxManager.onEvent(callback);
    }
  }

  /**
   * Create a new session.
   */
  async createSession(
    mode: SessionMode,
    repoId?: string,
    preferredModel?: { provider: string; modelId: string },
    systemPrompt?: string,
  ): Promise<SessionInfo> {
    if (this.sandboxManager) {
      return this.sandboxManager.createSession(
        mode,
        repoId,
        preferredModel,
        systemPrompt,
      );
    }

    return this.localManager!.createSession(
      mode,
      repoId,
      preferredModel,
      systemPrompt,
    );
  }

  /**
   * Get a session (local only - for sandbox use isSessionReady).
   */
  getSession(sessionId: string): ActiveSession | undefined {
    if (this.localManager) {
      return this.localManager.getSession(sessionId);
    }
    return undefined;
  }

  /**
   * Get sandbox session.
   */
  getSandboxSession(sessionId: string): SandboxSession | undefined {
    if (this.sandboxManager) {
      return this.sandboxManager.getSession(sessionId);
    }
    return undefined;
  }

  /**
   * Check if a session is ready.
   */
  isSessionReady(sessionId: string): boolean {
    if (this.sandboxManager) {
      return this.sandboxManager.isSessionReady(sessionId);
    }

    return !!this.localManager?.getSession(sessionId);
  }

  /**
   * Wait for a session to be ready.
   */
  async waitForSession(sessionId: string, timeout?: number): Promise<void> {
    if (this.sandboxManager) {
      return this.sandboxManager.waitForSession(sessionId, timeout);
    }
    // Local sessions are ready immediately
  }

  /**
   * List all sessions.
   */
  listSessions(): SessionInfo[] {
    if (this.sandboxManager) {
      return this.sandboxManager.listSessions();
    }
    return this.localManager!.listSessions();
  }

  /**
   * Resume a session.
   */
  async resumeSession(sessionId: string): Promise<void> {
    if (this.localManager) {
      await this.localManager.resumeSession(sessionId);
    }
    // Sandbox sessions don't need explicit resume
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.sandboxManager) {
      return this.sandboxManager.deleteSession(sessionId);
    }
    return this.localManager!.deleteSession(sessionId);
  }

  /**
   * Update session activity.
   */
  touchSession(sessionId: string): void {
    if (this.localManager) {
      this.localManager.touchSession(sessionId);
    }
  }

  /**
   * List available models.
   */
  listAvailableModels(): unknown[] {
    if (this.localManager) {
      return this.localManager.listAvailableModels();
    }
    // For sandbox mode, we'd need to query the sandbox
    // For now, return empty (models are managed inside sandbox)
    return [];
  }

  /**
   * Find an available model.
   */
  findAvailableModel(provider: string, modelId: string): unknown | undefined {
    if (this.localManager) {
      return this.localManager.findAvailableModel(provider, modelId);
    }
    return undefined;
  }

  /**
   * Send a prompt to a session.
   */
  async prompt(sessionId: string, message: string): Promise<void> {
    if (this.sandboxManager) {
      await this.sandboxManager.sendRequestNoWait(sessionId, "prompt", {
        message,
      });
      return;
    }

    const session = this.localManager!.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    // Don't await - prompt runs async, events stream back
    session.session.prompt(message).catch((error) => {
      console.error(`Prompt error for session ${sessionId}:`, error);
    });
  }

  /**
   * Abort current operation.
   */
  async abort(sessionId: string): Promise<void> {
    if (this.sandboxManager) {
      await this.sandboxManager.sendRequest(sessionId, "abort", {});
      return;
    }

    const session = this.localManager!.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    await session.session.abort();
  }

  /**
   * Get session state.
   */
  async getState(sessionId: string): Promise<unknown> {
    if (this.sandboxManager) {
      return this.sandboxManager.sendRequest(sessionId, "get_state", {});
    }

    const session = this.localManager!.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    return {
      model: session.session.model,
      thinkingLevel: session.session.thinkingLevel,
      isStreaming: session.session.isStreaming,
      sessionId: session.session.sessionId,
      sessionFile: session.session.sessionFile,
      messageCount: session.session.messages.length,
    };
  }

  /**
   * Get messages from a session.
   */
  async getMessages(sessionId: string): Promise<unknown> {
    if (this.sandboxManager) {
      return this.sandboxManager.sendRequest(sessionId, "get_messages", {});
    }

    const session = this.localManager!.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    return { messages: session.session.messages };
  }

  /**
   * Set model for a session.
   */
  async setModel(
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<unknown> {
    if (this.sandboxManager) {
      return this.sandboxManager.sendRequest(sessionId, "set_model", {
        provider,
        modelId,
      });
    }

    const session = this.localManager!.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    const model = this.localManager!.findAvailableModel(provider, modelId);
    if (!model) {
      throw new Error(`Model not available: ${provider}/${modelId}`);
    }

    await session.session.setModel(model);
    return { model };
  }

  /**
   * Dispose all resources.
   */
  async dispose(): Promise<void> {
    if (this.sandboxManager) {
      await this.sandboxManager.dispose();
    }
  }
}
