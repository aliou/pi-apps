/**
 * Session manager - handles AgentSession lifecycle and state persistence.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  ModelRegistry,
  SessionManager as PiSessionManager,
} from "@mariozechner/pi-coding-agent";
import { getRepo } from "../repos.js";
import type { ServerState, SessionInfo } from "../types.js";
import { createWorktree, deleteWorktree } from "./worktree.js";

export interface ActiveSession {
  session: AgentSession;
  info: SessionInfo;
  repoPath: string;
  unsubscribe: () => void;
}

export type SessionEventCallback = (
  sessionId: string,
  event: AgentSessionEvent,
) => void;

/**
 * Manages all active sessions and their persistence.
 */
export class SessionManager {
  private dataDir: string;
  private sessions: Map<string, ActiveSession> = new Map();
  private state: ServerState;
  private eventCallback?: SessionEventCallback;

  // Shared auth and model registry
  private authStorage;
  private modelRegistry;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.state = this.loadState();

    // TODO: Replace file-based auth with encrypted storage or system keychain
    // (macOS Keychain, Linux secret-service, etc.) using setFallbackResolver or custom impl
    const authPath = join(dataDir, "auth.json");
    this.authStorage = new AuthStorage(authPath);

    // No custom models.json for now (built-in models only)
    this.modelRegistry = new ModelRegistry(this.authStorage);
  }

  private getDefaultModel() {
    let model = this.modelRegistry.find("mistral", "devstral-2512");
    if (!model) {
      model = this.modelRegistry.find("anthropic", "claude-3-5-sonnet-latest");
    }
    if (!model) {
      const available = this.modelRegistry.getAvailable();
      if (available.length > 0) {
        model = available[0];
      }
    }
    return model;
  }

  /**
   * Set callback for session events.
   */
  onEvent(callback: SessionEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Create a new session for a repo.
   */
  async createSession(repoId: string): Promise<SessionInfo> {
    const repo = getRepo(this.dataDir, repoId);
    if (!repo) {
      throw new Error(`Repo not found: ${repoId}`);
    }

    const sessionId = crypto.randomUUID();
    const worktreesDir = join(this.dataDir, "worktrees");
    const sessionsDir = join(this.dataDir, "sessions");

    // Create worktree
    const worktreePath = await createWorktree(
      repo.path,
      worktreesDir,
      sessionId,
    );

    // Create session info
    const now = new Date().toISOString();
    const info: SessionInfo = {
      sessionId,
      repoId,
      worktreePath,
      createdAt: now,
      lastActivityAt: now,
    };

    // Find a model to use
    const model = this.getDefaultModel();

    if (!model) {
      console.warn("No models found! Session created without a model.");
    }

    // Create AgentSession
    const { session } = await createAgentSession({
      cwd: worktreePath,
      sessionManager: PiSessionManager.create(worktreePath, sessionsDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools: createCodingTools(worktreePath),
      model,
    });

    // Subscribe to events
    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    // Store active session
    this.sessions.set(sessionId, {
      session,
      info,
      repoPath: repo.path,
      unsubscribe,
    });

    // Persist state
    this.state.sessions[sessionId] = info;
    this.saveState();

    return info;
  }

  /**
   * Get an active session.
   */
  getSession(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions (active and persisted).
   */
  listSessions(): SessionInfo[] {
    return Object.values(this.state.sessions);
  }

  /**
   * Resume a persisted session.
   */
  async resumeSession(sessionId: string): Promise<ActiveSession> {
    // Check if already active
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    // Load from state
    const info = this.state.sessions[sessionId];
    if (!info) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const repo = getRepo(this.dataDir, info.repoId);
    if (!repo) {
      throw new Error(`Repo not found: ${info.repoId}`);
    }

    // Check if worktree still exists
    if (!existsSync(info.worktreePath)) {
      throw new Error(`Worktree not found: ${info.worktreePath}`);
    }

    const sessionsDir = join(this.dataDir, "sessions");

    // Find a model to use if session doesn't have one restored
    const model = this.getDefaultModel();

    // Resume AgentSession
    const { session } = await createAgentSession({
      cwd: info.worktreePath,
      sessionManager: PiSessionManager.continueRecent(
        info.worktreePath,
        sessionsDir,
      ),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools: createCodingTools(info.worktreePath),
      model, // Provide default model in case restoration fails
    });

    // Subscribe to events
    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    const activeSession: ActiveSession = {
      session,
      info,
      repoPath: repo.path,
      unsubscribe,
    };

    this.sessions.set(sessionId, activeSession);

    // Update last activity
    info.lastActivityAt = new Date().toISOString();
    this.saveState();

    return activeSession;
  }

  /**
   * Delete a session and its worktree.
   */
  async deleteSession(sessionId: string): Promise<void> {
    const active = this.sessions.get(sessionId);
    const info = this.state.sessions[sessionId];

    if (active) {
      // Unsubscribe and dispose
      active.unsubscribe();
      active.session.dispose();
      this.sessions.delete(sessionId);

      // Delete worktree
      await deleteWorktree(active.repoPath, active.info.worktreePath);
    } else if (info) {
      // Not active but persisted - try to delete worktree
      const repo = getRepo(this.dataDir, info.repoId);
      if (repo) {
        await deleteWorktree(repo.path, info.worktreePath);
      }
    }

    // Remove from state
    delete this.state.sessions[sessionId];
    this.saveState();
  }

  /**
   * Update session activity timestamp.
   */
  touchSession(sessionId: string): void {
    const info = this.state.sessions[sessionId];
    if (info) {
      info.lastActivityAt = new Date().toISOString();
      this.saveState();
    }
  }

  private handleSessionEvent(
    sessionId: string,
    event: AgentSessionEvent,
  ): void {
    // Update activity
    this.touchSession(sessionId);

    // Forward to callback
    if (this.eventCallback) {
      this.eventCallback(sessionId, event);
    }
  }

  private loadState(): ServerState {
    const statePath = join(this.dataDir, "state.json");

    if (!existsSync(statePath)) {
      return { sessions: {} };
    }

    try {
      const content = readFileSync(statePath, "utf-8");
      return JSON.parse(content) as ServerState;
    } catch (error) {
      console.error(`Failed to load state.json: ${error}`);
      return { sessions: {} };
    }
  }

  private saveState(): void {
    const statePath = join(this.dataDir, "state.json");
    writeFileSync(statePath, JSON.stringify(this.state, null, 2));
  }
}
