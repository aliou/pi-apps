import type { WSContext } from "hono/ws";
import { createLogger } from "../lib/logger";
import type { SandboxChannel } from "../sandbox/types";
import type { EventJournal } from "../services/event-journal";
import type { EventHookRegistry } from "./hooks/registry";
import type { ClientCommand, PiEvent, ServerEvent } from "./types";

/**
 * Manages a WebSocket connection to a session.
 * Handles:
 * - Forwarding commands from client to sandbox channel
 * - Forwarding events from sandbox channel to client
 * - Event replay on reconnection
 * - Journaling events for durability
 */
const logger = createLogger("ws");

export class WebSocketConnection {
  private lastSeq: number;
  private closed = false;
  private unsubMessage: (() => void) | null = null;
  private unsubClose: (() => void) | null = null;

  constructor(
    private ws: WSContext,
    private sessionId: string,
    private channel: SandboxChannel,
    private journal: EventJournal,
    private eventHooks: EventHookRegistry,
    initialSeq = 0,
  ) {
    this.lastSeq = initialSeq;
    this.setupChannelListener();
  }

  /**
   * Replay missed events from journal.
   */
  async replayFromSeq(fromSeq: number): Promise<void> {
    const events = this.journal.getAfterSeq(this.sessionId, fromSeq);
    if (events.length === 0) return;

    const lastEvent = events[events.length - 1];
    if (!lastEvent) return;

    const toSeq = lastEvent.seq;
    this.send({ type: "replay_start", fromSeq, toSeq });

    for (const event of events) {
      try {
        const payload = JSON.parse(event.payload) as PiEvent;
        this.send(payload);
      } catch (err) {
        logger.error(
          { err, sessionId: this.sessionId },
          "skipping malformed replay event",
        );
      }
    }

    this.send({ type: "replay_end" });
    this.lastSeq = toSeq;
  }

  /**
   * Handle incoming command from client.
   */
  handleCommand(command: ClientCommand): void {
    if (this.closed) return;

    // Journal prompt commands so they appear in event history
    if (command.type === "prompt") {
      this.journal.append(this.sessionId, command.type, command);
    }

    // Run event hooks
    this.eventHooks.handle(this.sessionId, command.type, command);

    // Forward to sandbox as JSON string (channel handles framing)
    this.channel.send(JSON.stringify(command));
  }

  /**
   * Send data to the WebSocket client.
   */
  send(data: ServerEvent): void {
    if (this.closed) return;

    try {
      const raw = this.ws.raw as WebSocket | undefined;
      if (raw && raw.readyState === 1) {
        this.ws.send(JSON.stringify(data));
      }
    } catch (err) {
      logger.error({ err, sessionId: this.sessionId }, "send error");
    }
  }

  /**
   * Clean up resources.
   */
  close(): void {
    this.closed = true;
    this.unsubMessage?.();
    this.unsubClose?.();
    this.unsubMessage = null;
    this.unsubClose = null;
    this.channel.close();
  }

  get currentSeq(): number {
    return this.lastSeq;
  }

  private setupChannelListener(): void {
    // Subscribe to messages from the sandbox (already-split JSON lines)
    this.unsubMessage = this.channel.onMessage((message) => {
      const trimmed = message.trim();
      if (!trimmed) {
        return;
      }

      // Pi RPC protocol is JSON lines. Ignore non-JSON stdout noise
      // (e.g. npm/git output emitted by subprocesses in the guest).
      if (!trimmed.startsWith("{")) {
        logger.debug(
          { sessionId: this.sessionId, line: trimmed.slice(0, 200) },
          "ignoring non-json sandbox line",
        );
        return;
      }

      try {
        const event = JSON.parse(trimmed) as PiEvent;
        this.handleSandboxEvent(event);
      } catch (err) {
        logger.warn(
          { sessionId: this.sessionId, err, raw: trimmed.slice(0, 500) },
          "failed to parse sandbox JSON line",
        );
      }
    });

    // Subscribe to channel close
    this.unsubClose = this.channel.onClose(() => {
      if (!this.closed) {
        this.send({
          type: "sandbox_status",
          status: "stopped",
          message: "Sandbox channel closed",
        });
      }
    });
  }

  /**
   * Handle event from sandbox.
   */
  private handleSandboxEvent(event: PiEvent): void {
    if (this.closed) return;

    // Journal first (outbox pattern)
    const seq = this.journal.append(this.sessionId, event.type, event);
    this.lastSeq = seq;

    // Run event hooks
    this.eventHooks.handle(this.sessionId, event.type, event);

    // Then forward to client
    this.send(event);
  }
}

/**
 * Manages all active WebSocket connections.
 * Multiple clients can connect to the same session.
 */
export class ConnectionManager {
  private connections = new Map<string, Set<WebSocketConnection>>();

  /**
   * Add a connection for a session.
   */
  add(sessionId: string, connection: WebSocketConnection): void {
    let sessionConnections = this.connections.get(sessionId);
    if (!sessionConnections) {
      sessionConnections = new Set();
      this.connections.set(sessionId, sessionConnections);
    }
    sessionConnections.add(connection);
  }

  /**
   * Remove a connection for a session.
   */
  remove(sessionId: string, connection: WebSocketConnection): void {
    const sessionConnections = this.connections.get(sessionId);
    if (sessionConnections) {
      sessionConnections.delete(connection);
      if (sessionConnections.size === 0) {
        this.connections.delete(sessionId);
      }
    }
  }

  /**
   * Get all connections for a session.
   */
  getForSession(sessionId: string): Set<WebSocketConnection> {
    return this.connections.get(sessionId) ?? new Set();
  }

  /**
   * Broadcast an event to all connections for a session.
   */
  broadcast(sessionId: string, event: ServerEvent): void {
    const sessionConnections = this.connections.get(sessionId);
    if (sessionConnections) {
      for (const connection of sessionConnections) {
        connection.send(event);
      }
    }
  }

  /**
   * Get the number of active connections for a session.
   */
  getConnectionCount(sessionId: string): number {
    return this.connections.get(sessionId)?.size ?? 0;
  }
}
