/**
 * WebSocket connection state management.
 * Handles hello/resume, seq tracking, and event buffering.
 */

import type {
  HelloParams,
  HelloResult,
  NativeToolDefinition,
  ResumeInfo,
  WSEvent,
  WSResponse,
} from "../types.js";

const REPLAY_WINDOW_SEC = 60;
const MAX_BUFFERED_EVENTS = 1000;

interface BufferedEvent {
  event: WSEvent;
  timestamp: number;
}

interface PendingNativeCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  sessionId: string;
  toolName: string;
}

/**
 * Represents a single WebSocket connection.
 */
export class Connection {
  readonly connectionId: string;
  private ws: WebSocket;
  private attachedSessions: Set<string> = new Set();
  private seqBySession: Map<string, number> = new Map();
  private nativeTools: Map<string, NativeToolDefinition> = new Map();
  private pendingCalls: Map<string, PendingNativeCall> = new Map();

  constructor(connectionId: string, ws: WebSocket) {
    this.connectionId = connectionId;
    this.ws = ws;
  }

  /**
   * Store native tools from hello handshake.
   */
  setNativeTools(tools: NativeToolDefinition[]): void {
    this.nativeTools.clear();
    for (const tool of tools) {
      this.nativeTools.set(tool.name, tool);
    }
  }

  /**
   * Get all native tools for this connection.
   */
  getNativeTools(): NativeToolDefinition[] {
    return Array.from(this.nativeTools.values());
  }

  /**
   * Check if connection supports a native tool.
   */
  hasNativeTool(name: string): boolean {
    return this.nativeTools.has(name);
  }

  /**
   * Call a native tool - sends event to client, waits for response.
   * No timeout - tools may require user interaction (permission prompts, etc.)
   * Use signal for cancellation.
   */
  async callNativeTool(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.nativeTools.has(toolName)) {
      throw new Error(`Unknown native tool: ${toolName}`);
    }

    if (!this.isOpen) {
      throw new Error("Connection closed");
    }

    const callId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Handle abort signal
      if (signal) {
        if (signal.aborted) {
          reject(new Error("Tool call aborted"));
          return;
        }

        signal.addEventListener(
          "abort",
          () => {
            const pending = this.pendingCalls.get(callId);
            if (pending) {
              this.pendingCalls.delete(callId);
              // Send cancel event to client
              this.sendCancelEvent(sessionId, callId);
              reject(new Error("Tool call aborted"));
            }
          },
          { once: true },
        );
      }

      this.pendingCalls.set(callId, { resolve, reject, sessionId, toolName });

      // Send request event to client
      const seq = this.nextSeq(sessionId);
      this.sendEvent({
        v: 1,
        kind: "event",
        sessionId,
        seq,
        type: "native_tool_request",
        payload: { callId, toolName, args },
      });
    });
  }

  /**
   * Send cancel event to client.
   */
  private sendCancelEvent(sessionId: string, callId: string): void {
    const seq = this.nextSeq(sessionId);
    this.sendEvent({
      v: 1,
      kind: "event",
      sessionId,
      seq,
      type: "native_tool_cancel",
      payload: { callId },
    });
  }

  /**
   * Handle response from native client.
   * @returns true if callId was found and handled
   */
  handleNativeToolResponse(
    callId: string,
    result?: unknown,
    error?: { message: string },
  ): boolean {
    const pending = this.pendingCalls.get(callId);
    if (!pending) return false;

    this.pendingCalls.delete(callId);

    if (error) {
      pending.reject(new Error(error.message));
    } else {
      pending.resolve(result);
    }
    return true;
  }

  /**
   * Fail all pending native tool calls.
   * Call when connection closes or session detaches.
   */
  failAllPendingCalls(reason: string): void {
    for (const [_callId, pending] of this.pendingCalls) {
      pending.reject(new Error(reason));
    }
    this.pendingCalls.clear();
  }

  /**
   * Attach to a session to receive its events.
   */
  attach(sessionId: string): void {
    this.attachedSessions.add(sessionId);
    if (!this.seqBySession.has(sessionId)) {
      this.seqBySession.set(sessionId, 0);
    }
  }

  /**
   * Detach from a session.
   */
  detach(sessionId: string): void {
    this.attachedSessions.delete(sessionId);
  }

  /**
   * Check if attached to a session.
   */
  isAttached(sessionId: string): boolean {
    return this.attachedSessions.has(sessionId);
  }

  /**
   * Get next seq number for a session.
   */
  nextSeq(sessionId: string): number {
    const current = this.seqBySession.get(sessionId) ?? 0;
    const next = current + 1;
    this.seqBySession.set(sessionId, next);
    return next;
  }

  /**
   * Get last seq for resume info.
   */
  getLastSeqBySession(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [sessionId, seq] of this.seqBySession) {
      result[sessionId] = seq;
    }
    return result;
  }

  /**
   * Send a response.
   */
  sendResponse(response: WSResponse): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  /**
   * Send an event.
   */
  sendEvent(event: WSEvent): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Check if connection is open.
   */
  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * Manages all active connections and event buffering for resume.
 */
export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private eventBuffers: Map<string, BufferedEvent[]> = new Map();

  /**
   * Register a new connection with a pre-assigned ID.
   */
  registerConnection(connectionId: string, ws: WebSocket): Connection {
    const connection = new Connection(connectionId, ws);
    this.connections.set(connectionId, connection);
    return connection;
  }

  /**
   * Get a connection by ID.
   */
  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Remove a connection.
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * Handle hello with optional resume.
   */
  handleHello(connection: Connection, params: HelloParams): HelloResult {
    const result: HelloResult = {
      connectionId: connection.connectionId,
      server: {
        name: "pi-server",
        version: "0.1.0",
      },
      capabilities: {
        resume: true,
        replayWindowSec: REPLAY_WINDOW_SEC,
      },
    };

    // Handle resume
    if (params.resume) {
      this.replayEvents(connection, params.resume);
    }

    return result;
  }

  /**
   * Buffer an event for a session (for resume).
   */
  bufferEvent(sessionId: string, event: WSEvent): void {
    let buffer = this.eventBuffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.eventBuffers.set(sessionId, buffer);
    }

    buffer.push({
      event,
      timestamp: Date.now(),
    });

    // Trim old events
    const cutoff = Date.now() - REPLAY_WINDOW_SEC * 1000;
    while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
      buffer.shift();
    }

    // Trim by count
    while (buffer.length > MAX_BUFFERED_EVENTS) {
      buffer.shift();
    }
  }

  /**
   * Broadcast an event to all connections attached to a session.
   */
  broadcastEvent(sessionId: string, type: string, payload: unknown): void {
    for (const connection of this.connections.values()) {
      if (connection.isAttached(sessionId) && connection.isOpen) {
        const seq = connection.nextSeq(sessionId);
        const event: WSEvent = {
          v: 1,
          kind: "event",
          sessionId,
          seq,
          type,
          payload,
        };

        connection.sendEvent(event);
        this.bufferEvent(sessionId, event);
      }
    }
  }

  /**
   * Replay missed events on resume.
   */
  private replayEvents(connection: Connection, resumeInfo: ResumeInfo): void {
    for (const [sessionId, lastSeq] of Object.entries(
      resumeInfo.lastSeqBySession,
    )) {
      const buffer = this.eventBuffers.get(sessionId);
      if (!buffer) continue;

      // Re-attach to session
      connection.attach(sessionId);

      // Find events after lastSeq
      for (const { event } of buffer) {
        if (event.seq > lastSeq) {
          connection.sendEvent(event);
        }
      }
    }
  }

  /**
   * Get all connections attached to a session.
   */
  getSessionConnections(sessionId: string): Connection[] {
    return Array.from(this.connections.values()).filter((c) =>
      c.isAttached(sessionId),
    );
  }
}
