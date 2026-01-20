/**
 * Session Manager Interface
 *
 * Defines the common interface for session managers, allowing the server
 * to work with both local sessions and sandbox-based sessions transparently.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { SessionInfo, SessionMode } from "../types.js";

/**
 * Event callback for session events.
 */
export type SessionEventCallback = (
  sessionId: string,
  event: AgentSessionEvent,
) => void;

/**
 * Active session state.
 */
export interface ActiveSessionState {
  sessionId: string;
  info: SessionInfo;
  isReady: boolean;
}

/**
 * Model information.
 */
export interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
}

/**
 * Session state response.
 */
export interface SessionState {
  model?: ModelInfo;
  thinkingLevel?: string;
  isStreaming?: boolean;
  sessionId?: string;
  sessionFile?: string;
  messageCount?: number;
}

/**
 * Message from a session.
 */
export interface SessionMessage {
  id: string;
  role: string;
  content: unknown;
  timestamp?: string;
  model?: string;
}

/**
 * Interface for session managers.
 *
 * Both local SessionManager and SandboxSessionManager implement this interface,
 * allowing the server to work with either transparently.
 */
export interface ISessionManager {
  /**
   * Set callback for session events.
   */
  onEvent(callback: SessionEventCallback): void;

  /**
   * Create a new session.
   */
  createSession(
    mode: SessionMode,
    repoId?: string,
    preferredModel?: { provider: string; modelId: string },
    systemPrompt?: string,
  ): Promise<SessionInfo>;

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): ActiveSessionState | undefined;

  /**
   * List all sessions.
   */
  listSessions(): SessionInfo[];

  /**
   * Resume a session (make it active if not already).
   */
  resumeSession(sessionId: string): Promise<ActiveSessionState>;

  /**
   * Delete a session.
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Update session activity timestamp.
   */
  touchSession(sessionId: string): void;

  /**
   * List available models.
   */
  listAvailableModels(): ModelInfo[];

  /**
   * Find a specific model.
   */
  findAvailableModel(provider: string, modelId: string): ModelInfo | undefined;

  /**
   * Send a prompt to a session.
   */
  prompt(sessionId: string, message: string): Promise<void>;

  /**
   * Abort current operation in a session.
   */
  abort(sessionId: string): Promise<void>;

  /**
   * Get session state.
   */
  getState(sessionId: string): Promise<SessionState>;

  /**
   * Get messages from a session.
   */
  getMessages(sessionId: string): Promise<SessionMessage[]>;

  /**
   * Set the model for a session.
   */
  setModel(
    sessionId: string,
    provider: string,
    modelId: string,
  ): Promise<ModelInfo>;
}
