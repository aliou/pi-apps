import readline from "node:readline";
import type { WSContext } from "hono/ws";
import type { SandboxStreams } from "../sandbox/types";
import type { EventJournal } from "../services/event-journal";
import type { ClientCommand, PiEvent, ServerEvent } from "./types";

/**
 * Manages a WebSocket connection to a session.
 * Handles:
 * - Forwarding commands from client to sandbox streams
 * - Forwarding events from sandbox streams to client
 * - Event replay on reconnection
 * - Journaling events for durability
 */
export class WebSocketConnection {
  private lastSeq: number;
  private rl: readline.Interface | null = null;
  private closed = false;

  constructor(
    private ws: WSContext,
    private sessionId: string,
    private streams: SandboxStreams,
    private journal: EventJournal,
    initialSeq = 0,
  ) {
    this.lastSeq = initialSeq;
    this.setupSandboxListener();
  }

  /**
   * Replay missed events from journal.
   */
  async replayFromSeq(fromSeq: number): Promise<void> {
    const events = this.journal.getAfterSeq(this.sessionId, fromSeq);
    if (events.length === 0) return;

    const lastEvent = events[events.length - 1];
    if (!lastEvent) return; // Should never happen after length check, but satisfy TS

    const toSeq = lastEvent.seq;
    this.send({ type: "replay_start", fromSeq, toSeq });

    for (const event of events) {
      try {
        const payload = JSON.parse(event.payload) as PiEvent;
        this.send(payload);
      } catch {
        // Skip malformed events
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

    // Forward to sandbox stdin as JSON line
    this.streams.stdin.write(`${JSON.stringify(command)}\n`);
  }

  /**
   * Handle event from sandbox stdout.
   */
  private handleSandboxEvent(event: PiEvent): void {
    if (this.closed) return;

    // Journal first (outbox pattern)
    const seq = this.journal.append(this.sessionId, event.type, event);
    this.lastSeq = seq;

    // Then forward to client
    this.send(event);
  }

  /**
   * Send data to the WebSocket client.
   */
  send(data: ServerEvent): void {
    if (this.closed) return;

    try {
      const raw = this.ws.raw as WebSocket | undefined;
      if (raw && raw.readyState === 1) {
        // WebSocket.OPEN = 1
        this.ws.send(JSON.stringify(data));
      }
    } catch {
      // Ignore send errors
    }
  }

  /**
   * Clean up resources.
   */
  close(): void {
    this.closed = true;
    this.rl?.close();
    this.rl = null;
    this.streams.detach();
  }

  get currentSeq(): number {
    return this.lastSeq;
  }

  private setupSandboxListener(): void {
    // Parse sandbox stdout (JSON lines)
    this.rl = readline.createInterface({ input: this.streams.stdout });

    this.rl.on("line", (line) => {
      try {
        const event = JSON.parse(line) as PiEvent;
        this.handleSandboxEvent(event);
      } catch {
        // Ignore invalid JSON
      }
    });

    this.rl.on("close", () => {
      // Sandbox stream closed
      if (!this.closed) {
        this.send({
          type: "sandbox_status",
          status: "stopped",
          message: "Sandbox stream closed",
        });
      }
    });
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
