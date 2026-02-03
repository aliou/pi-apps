import type { UpgradeWebSocket } from "hono/ws";
import type { SandboxManager } from "../sandbox/manager";
import type { SandboxProviderType } from "../sandbox/provider-types";
import type { EventJournal } from "../services/event-journal";
import type { SessionService } from "../services/session.service";
import { type ConnectionManager, WebSocketConnection } from "./connection";
import { isClientCommand } from "./types";

function wsLog(
  event: string,
  sessionId: string | undefined,
  fields?: Record<string, unknown>,
) {
  console.log(
    `[ws] ${event} session=${sessionId ?? "unknown"}${
      fields
        ? ` ${Object.entries(fields)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}`
        : ""
    }`,
  );
}

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
        wsLog("open", sessionId, { lastSeq });

        // Validate session exists and is active
        const session = sessionId ? sessionService.get(sessionId) : null;
        if (!session || session.status === "deleted") {
          wsLog("rejected", sessionId, { reason: "session_not_found" });
          ws.close(4004, "Session not found");
          return;
        }

        if (session.status !== "active") {
          wsLog("rejected", sessionId, { reason: "session_not_active" });
          ws.close(4003, "Session not active — call activate first");
          return;
        }

        if (!session.sandboxProvider || !session.sandboxProviderId) {
          wsLog("rejected", sessionId, { reason: "sandbox_not_provisioned" });
          ws.close(4003, "Sandbox not provisioned");
          return;
        }

        // Attach streams (sandbox is already running thanks to activate)
        const providerType = session.sandboxProvider as SandboxProviderType;
        const providerId = session.sandboxProviderId;

        sandboxManager
          .attachSession(providerType, providerId)
          .then(({ streams }) => {
            wsLog("attached", sessionId);
            connection = new WebSocketConnection(
              ws,
              sessionId,
              streams,
              eventJournal,
              lastSeq,
            );

            connectionManager.add(sessionId, connection);

            const maxSeq = eventJournal.getMaxSeq(sessionId);
            connection.send({
              type: "connected",
              sessionId,
              lastSeq: maxSeq,
            });

            if (lastSeq > 0 && lastSeq < maxSeq) {
              connection.replayFromSeq(lastSeq);
            }
          })
          .catch((err) => {
            wsLog("attach_failed", sessionId, { error: String(err) });
            console.error(
              `Failed to attach streams for session ${sessionId}:`,
              err,
            );
            ws.close(4003, "Failed to attach to sandbox");
          });
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
            wsLog("cmd", sessionId, { type: parsed.type });
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
        wsLog("closed", sessionId);
        if (connection && sessionId) {
          // Remove from connection manager
          connectionManager.remove(sessionId, connection);
          connection.close();

          // Note: sandbox keeps running, events keep being journaled
          // This allows reconnection without losing state
        }
      },

      onError(evt, _ws) {
        wsLog("error", sessionId, { error: String(evt) });
        console.error(`WebSocket error for session ${sessionId}:`, evt);
        if (connection && sessionId) {
          connectionManager.remove(sessionId, connection);
          connection.close();
        }
      },
    };
  });
}
