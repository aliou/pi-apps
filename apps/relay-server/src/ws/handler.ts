import type { UpgradeWebSocket } from "hono/ws";
import type { SandboxManager } from "../sandbox/manager";
import type { EventJournal } from "../services/event-journal";
import type { SessionService } from "../services/session.service";
import { type ConnectionManager, WebSocketConnection } from "./connection";
import { isClientCommand } from "./types";

export interface WebSocketHandlerDeps {
  sandboxManager: SandboxManager;
  sessionService: SessionService;
  eventJournal: EventJournal;
}

/**
 * Create WebSocket handler for session connections.
 */
export function createWebSocketHandler(
  upgradeWebSocket: UpgradeWebSocket,
  deps: WebSocketHandlerDeps,
  connectionManager: ConnectionManager,
) {
  const { sandboxManager, sessionService, eventJournal } = deps;

  return upgradeWebSocket((c) => {
    const sessionId = c.req.param("id");
    const lastSeqParam = c.req.query("lastSeq");
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;

    let connection: WebSocketConnection | null = null;

    return {
      onOpen(_evt, ws) {
        // Validate session exists
        const session = sessionId ? sessionService.get(sessionId) : null;
        if (!session || session.status === "deleted") {
          ws.close(4004, "Session not found");
          return;
        }

        // Get or create sandbox for session
        const sandbox = sandboxManager.getForSession(sessionId);
        if (!sandbox) {
          // Try to create sandbox if session is in a state that allows it
          if (session.status === "creating" || session.status === "ready") {
            // Sandbox will be created async, client should retry
            ws.close(4003, "Sandbox not ready, retry in a moment");
            return;
          }
          ws.close(4003, "Sandbox not available");
          return;
        }

        // Create connection
        connection = new WebSocketConnection(
          ws,
          sessionId,
          sandbox,
          eventJournal,
          lastSeq,
        );

        // Register with connection manager
        connectionManager.add(sessionId, connection);

        // Send connected event
        const maxSeq = eventJournal.getMaxSeq(sessionId);
        connection.send({
          type: "connected",
          sessionId,
          lastSeq: maxSeq,
        });

        // Replay missed events if client provided lastSeq
        if (lastSeq > 0 && lastSeq < maxSeq) {
          connection.replayFromSeq(lastSeq);
        }

        // Update session status to running
        if (session.status === "ready") {
          sessionService.update(sessionId, { status: "running" });
        }
      },

      onMessage(evt, _ws) {
        if (!connection || !sessionId) return;

        try {
          const data =
            typeof evt.data === "string"
              ? evt.data
              : evt.data instanceof Buffer
                ? evt.data.toString()
                : "";

          const parsed = JSON.parse(data);

          if (isClientCommand(parsed)) {
            connection.handleCommand(parsed);
            // Touch session activity
            sessionService.touch(sessionId);
          } else {
            connection.send({
              type: "error",
              code: "INVALID_COMMAND",
              message: "Unknown command type",
            });
          }
        } catch {
          connection.send({
            type: "error",
            code: "PARSE_ERROR",
            message: "Invalid JSON",
          });
        }
      },

      onClose(_evt, _ws) {
        if (connection && sessionId) {
          // Remove from connection manager
          connectionManager.remove(sessionId, connection);
          connection.close();

          // Note: sandbox keeps running, events keep being journaled
          // This allows reconnection without losing state
        }
      },

      onError(evt, _ws) {
        console.error(`WebSocket error for session ${sessionId}:`, evt);
        if (connection && sessionId) {
          connectionManager.remove(sessionId, connection);
          connection.close();
        }
      },
    };
  });
}
