/**
 * Protocol types matching pi-core Swift definitions.
 * WebSocket message envelopes for client-server communication.
 */

export const PROTOCOL_VERSION = 1;

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
  payload?: unknown;
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
export interface SessionInfo {
  sessionId: string;
  repoId: string;
  worktreePath: string;
  createdAt: string;
  lastActivityAt: string;
  name?: string;
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
