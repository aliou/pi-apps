/**
 * Session manager - handles AgentSession lifecycle and state persistence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { getGitHubToken, getRepoByFullName } from "../github.js";
import { getRepo, upsertRepo } from "../repos.js";
import type { ServerState, SessionInfo, SessionMode } from "../types.js";
import type { ModelInfo } from "./interface.js";
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

  private resolveModel(preferred: { provider: string; modelId: string }) {
    this.modelRegistry.refresh();
    const available = this.modelRegistry.getAvailable();

    const preferredModel = this.modelRegistry.find(
      preferred.provider,
      preferred.modelId,
    );

    if (!preferredModel) {
      return undefined;
    }

    const isAvailable = available.some(
      (model) =>
        model.provider === preferredModel.provider &&
        model.id === preferredModel.id,
    );

    if (!isAvailable) {
      return undefined;
    }

    return preferredModel;
  }

  /**
   * Set callback for session events.
   */
  onEvent(callback: SessionEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Create a new session.
   * @param mode - "chat" for general conversation, "code" for repo-based coding
   * @param repoId - Required for code mode, ignored for chat mode
   * @param preferredModel - Optional model preference
   * @param systemPrompt - Optional custom system prompt (replaces default)
   */
  async createSession(
    mode: SessionMode,
    repoId?: string,
    preferredModel?: { provider: string; modelId: string },
    systemPrompt?: string,
  ): Promise<SessionInfo> {
    const sessionId = crypto.randomUUID();
    const sessionsDir = join(this.dataDir, "sessions");
    const sessionDir = join(sessionsDir, sessionId);

    let workingPath: string;
    let tools: ReturnType<typeof createCodingTools>;

    if (mode === "code") {
      if (!repoId) {
        throw new Error("repoId is required for code mode");
      }

      const repoPath = join(sessionDir, "repo");

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

      workingPath = repoPath;
      tools = createCodingTools(repoPath);
    } else {
      // Chat mode: simple directory, no coding tools
      workingPath = join(sessionDir, "workspace");
      if (!existsSync(workingPath)) {
        mkdirSync(workingPath, { recursive: true });
      }
      tools = []; // No tools for chat mode
    }

    const now = new Date().toISOString();
    const info: SessionInfo = {
      sessionId,
      mode,
      repoId: mode === "code" ? repoId : undefined,
      worktreePath: workingPath,
      createdAt: now,
      lastActivityAt: now,
    };

    // Only resolve model explicitly if a preferred model is provided
    // Otherwise, let createAgentSession use settings.json defaults
    const model = preferredModel
      ? this.resolveModel(preferredModel)
      : undefined;

    if (preferredModel && !model) {
      throw new Error(
        `Preferred model not available: ${preferredModel.provider}/${preferredModel.modelId}`,
      );
    }

    const { session } = await createAgentSession({
      cwd: workingPath,
      agentDir: this.dataDir,
      sessionManager: PiSessionManager.create(workingPath, sessionsDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools,
      model, // undefined if no preferred model - SDK will use settings.json
      systemPrompt, // undefined uses default, string replaces it
    });

    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    this.sessions.set(sessionId, {
      session,
      info,
      repoPath: workingPath,
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
  listAvailableModels(): ModelInfo[] {
    this.modelRegistry.refresh();
    return this.modelRegistry.getAvailable().map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
    }));
  }

  /**
   * Find an available model by provider/id.
   */
  findAvailableModel(provider: string, modelId: string): ModelInfo | undefined {
    this.modelRegistry.refresh();
    const model = this.modelRegistry
      .getAvailable()
      .find((model) => model.provider === provider && model.id === modelId);
    if (!model) return undefined;
    return {
      provider: model.provider,
      id: model.id,
      name: model.name,
    };
  }

  /**
   * Set model for a session by provider/id.
   */
  async setSessionModel(
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<ModelInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not active: ${sessionId}`);
    }

    this.modelRegistry.refresh();
    const model = this.modelRegistry
      .getAvailable()
      .find((m) => m.provider === provider && m.id === modelId);
    if (!model) {
      throw new Error(`Model not available: ${provider}/${modelId}`);
    }

    await session.session.setModel(model);
    return {
      provider: model.provider,
      id: model.id,
      name: model.name,
    };
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

    // Determine working path based on mode
    let workingPath: string;
    let tools: ReturnType<typeof createCodingTools>;
    const mode = info.mode ?? "code"; // Default to code for old sessions

    if (mode === "code" && info.repoId) {
      const repo =
        getRepo(this.dataDir, info.repoId, sessionId) ??
        getRepo(this.dataDir, info.repoId);

      workingPath = repo?.path ?? info.worktreePath;
      tools = createCodingTools(workingPath);
    } else {
      workingPath = info.worktreePath;
      tools = []; // No tools for chat mode
    }

    if (!workingPath || !existsSync(workingPath)) {
      throw new Error(`Working directory not found on disk: ${workingPath}`);
    }

    const sessionsDir = join(this.dataDir, "sessions");

    // Don't provide explicit model - let SDK restore from session or use settings.json
    // Resume AgentSession
    const { session } = await createAgentSession({
      cwd: workingPath,
      agentDir: this.dataDir,
      sessionManager: PiSessionManager.continueRecent(workingPath, sessionsDir),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools,
      // model omitted - SDK will restore from session or use settings.json default
    });

    // Subscribe to events
    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(sessionId, event);
    });

    const activeSession: ActiveSession = {
      session,
      info,
      repoPath: workingPath,
      unsubscribe,
    };

    this.sessions.set(sessionId, activeSession);

    // Update last activity and session name
    info.lastActivityAt = new Date().toISOString();
    info.name = session.sessionManager.getSessionName();
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
      let pathToDelete = info.worktreePath;

      // For code sessions, try to get repo path
      if (info.repoId) {
        const repo =
          getRepo(this.dataDir, info.repoId, sessionId) ??
          getRepo(this.dataDir, info.repoId);
        pathToDelete = repo?.path ?? info.worktreePath;
      }

      if (pathToDelete) {
        deleteSessionRepo(pathToDelete);
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
