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
import { getRepo, upsertRepo } from "../repos.js";
import type { ServerState, SessionInfo } from "../types.js";
import { getGitHubToken, getRepoByFullName } from "../github.js";
import {
  buildAuthedCloneUrl,
  deleteSessionRepo,
  ensureSessionRepo,
} from "./repo.js";

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

  private resolveModel(preferred?: { provider: string; modelId: string }) {
    this.modelRegistry.refresh();
    const available = this.modelRegistry.getAvailable();

    if (preferred) {
      const preferredModel = this.modelRegistry.find(
        preferred.provider,
        preferred.modelId,
      );
      if (preferredModel) {
        const isAvailable = available.some(
          (model) =>
            model.provider === preferredModel.provider &&
            model.id === preferredModel.id,
        );
        if (isAvailable) {
          return preferredModel;
        }
        console.warn(
          `Preferred model not available: ${preferred.provider}/${preferred.modelId}`,
        );
      } else {
        console.warn(
          `Preferred model not found: ${preferred.provider}/${preferred.modelId}`,
        );
      }
    }

    return available[0];
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
  async createSession(
    repoId: string,
    preferredModel?: { provider: string; modelId: string },
  ): Promise<SessionInfo> {
    const sessionId = crypto.randomUUID();
    const sessionsDir = join(this.dataDir, "sessions");
    const repoPath = join(sessionsDir, sessionId, "repo");

    const token = getGitHubToken();
    const remote = await getRepoByFullName(token, repoId);
    const authedCloneUrl = buildAuthedCloneUrl(remote.cloneUrl, token);

    const { branchName } = await ensureSessionRepo({
      repoPath,
      cloneUrl: authedCloneUrl,
      defaultBranch: remote.defaultBranch,
      sessionId,
    });

    upsertRepo(this.dataDir, {
      id: repoId,
      name: remote.name,
      path: repoPath,
      sessionId,
      fullName: remote.fullName,
      owner: remote.owner,
      private: remote.private,
      description: remote.description,
      htmlUrl: remote.htmlUrl,
      cloneUrl: remote.cloneUrl,
      sshUrl: remote.sshUrl,
      defaultBranch: remote.defaultBranch,
      branchName,
    });

    const now = new Date().toISOString();
    const info: SessionInfo = {
      sessionId,
      repoId,
      worktreePath: repoPath,
      createdAt: now,
      lastActivityAt: now,
    };

    const model = this.resolveModel(preferredModel);

    if (!model) {
      console.warn("No models found! Session created without a model.");
    }

    const { session } = await createAgentSession({
      cwd: repoPath,
      sessionManager: PiSessionManager.create(repoPath, sessionsDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools: createCodingTools(repoPath),
      model,
    });

    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    this.sessions.set(sessionId, {
      session,
      info,
      repoPath,
      unsubscribe,
    });

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
   * List models available with current auth.
   */
  listAvailableModels() {
    this.modelRegistry.refresh();
    return this.modelRegistry.getAvailable();
  }

  /**
   * Find an available model by provider/id.
   */
  findAvailableModel(provider: string, modelId: string) {
    this.modelRegistry.refresh();
    return this.modelRegistry
      .getAvailable()
      .find((model) => model.provider === provider && model.id === modelId);
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

    const repo =
      getRepo(this.dataDir, info.repoId, sessionId) ??
      getRepo(this.dataDir, info.repoId);

    const repoPath = repo?.path ?? info.worktreePath;
    if (!repoPath || !existsSync(repoPath)) {
      throw new Error(`Repo not found on disk: ${repoPath}`);
    }

    const sessionsDir = join(this.dataDir, "sessions");

    // Find a model to use if session doesn't have one restored
    const model = this.resolveModel();

    // Resume AgentSession
    const { session } = await createAgentSession({
      cwd: repoPath,
      sessionManager: PiSessionManager.continueRecent(repoPath, sessionsDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools: createCodingTools(repoPath),
      model, // Provide default model in case restoration fails
    });

    // Subscribe to events
    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    const activeSession: ActiveSession = {
      session,
      info,
      repoPath,
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

      deleteSessionRepo(active.info.worktreePath);
    } else if (info) {
      const repo =
        getRepo(this.dataDir, info.repoId, sessionId) ??
        getRepo(this.dataDir, info.repoId);
      const repoPath = repo?.path ?? info.worktreePath;
      if (repoPath) {
        deleteSessionRepo(repoPath);
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
