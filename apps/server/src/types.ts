/**
 * Protocol types matching pi-core Swift definitions.
 * WebSocket message envelopes for client-server communication.
 */

import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";

export const PROTOCOL_VERSION = 1;

// Re-export for convenience
export type { AgentSessionEvent };

// Server-specific events (not from pi-agent-core)
export type ServerEvent =
  | { type: "model_changed"; model: ModelInfo }
  | { type: "native_tool_request"; callId: string; toolName: string; args: Record<string, unknown> }
  | { type: "native_tool_cancel"; callId: string };

// Combined event type for WSEvent payload
export type WSEventPayload = AgentSessionEvent | ServerEvent;

// Message kinds
export type WSMessageKind = "request" | "response" | "event";

// Client -> Server request
export interface WSRequest {
  v: number;
  kind: "request";
  id: string;
  sessionId?: string;
  method: string;
  params?: Record<string, unknown>;
}

// Server -> Client response
export interface WSResponse {
  v: number;
  kind: "response";
  id: string;
  sessionId?: string;
  ok: boolean;
  result?: unknown;
  error?: RPCError;
}

// Server -> Client event
export interface WSEvent {
  v: number;
  kind: "event";
  sessionId: string;
  seq: number;
  type: string;
  payload: WSEventPayload;
}

export interface RPCError {
  code?: string;
  message: string;
  details?: string;
}

// Hello handshake
export interface HelloParams {
  client: ClientInfo;
  resume?: ResumeInfo;
  nativeTools?: NativeToolDefinition[];
}

/**
 * Native tool definition sent by client in hello.
 * Follows JSON Schema format for parameters.
 * Same structure as regular pi tools.
 */
export interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/**
 * Event payload: server -> client requesting native tool execution.
 */
export interface NativeToolRequestPayload {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Event payload: server -> client to cancel a pending tool call.
 */
export interface NativeToolCancelPayload {
  callId: string;
}

/**
 * RPC params: client -> server with tool execution result.
 */
export interface NativeToolResponseParams {
  callId: string;
  result?: unknown;
  error?: { message: string };
}

export interface ClientInfo {
  name: string;
  version: string;
}

export interface ResumeInfo {
  connectionId: string;
  lastSeqBySession: Record<string, number>;
}

export interface HelloResult {
  connectionId: string;
  server: ServerInfo;
  capabilities: ServerCapabilities;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface ServerCapabilities {
  resume: boolean;
  replayWindowSec?: number;
}

// Repo types
export interface RepoConfig {
  id: string;
  name: string;
  path: string;
  sessionId?: string;
  fullName?: string;
  owner?: string;
  private?: boolean;
  description?: string;
  htmlUrl?: string;
  cloneUrl?: string;
  sshUrl?: string;
  defaultBranch?: string;
  branchName?: string;
}

export interface ReposConfig {
  repos: RepoConfig[];
}

// Session types
export type SessionMode = "chat" | "code";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface SessionInfo {
  sessionId: string;
  mode: SessionMode;
  repoId?: string; // Required for code mode, optional for chat
  worktreePath: string;
  createdAt: string;
  lastActivityAt: string;
  name?: string;
  currentModel?: ModelInfo;
}

export interface ServerState {
  sessions: Record<string, SessionInfo>;
}

// Incoming message (for parsing)
export interface WSIncomingMessage {
  v?: number;
  kind?: WSMessageKind;
  id?: string;
  sessionId?: string;
  method?: string;
  params?: Record<string, unknown>;
}
