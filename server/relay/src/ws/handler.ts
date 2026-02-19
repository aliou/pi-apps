import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { createLogger } from "../lib/logger";
import type { SandboxManager } from "../sandbox/manager";
import type { EnvironmentService } from "../services/environment.service";
import type { EventJournal } from "../services/event-journal";
import type { SecretsService } from "../services/secrets.service";
import type { SessionService } from "../services/session.service";
import { DETACH_GRACE_MS, type SessionHubManager } from "./session-hub";
import { isClientCommand } from "./types";

const logger = createLogger("ws");

export interface WebSocketHandlerDeps {
  sandboxManager: SandboxManager;
  sessionService: SessionService;
  eventJournal: EventJournal;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
  sessionHubManager: SessionHubManager;
}

export function createWebSocketHandler(
  upgradeWebSocket: UpgradeWebSocket,
  deps: WebSocketHandlerDeps,
) {
  const { sessionService, sessionHubManager } = deps;

  return upgradeWebSocket((c) => {
    const sessionId = c.req.param("id");
    const lastSeqParam = c.req.query("lastSeq");
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;
    const clientId = c.req.query("clientId");

    // clientId is required
    if (!clientId) {
      return {
        onOpen(_evt: unknown, ws: WSContext) {
          logger.warn({ sessionId }, "ws rejected: missing clientId");
          ws.close(4001, "clientId query parameter is required");
        },
        onMessage() {},
        onClose() {},
        onError() {},
      };
    }

    // Store client ID for this connection
    const currentClientId = clientId;

    return {
      async onOpen(_evt, ws) {
        logger.info(
          { sessionId, clientId: currentClientId, lastSeq },
          "ws open",
        );

        // Validate session exists and is active
        const session = sessionId ? sessionService.get(sessionId) : null;
        if (!session || session.status === "archived") {
          logger.warn(
            {
              sessionId,
              clientId: currentClientId,
              reason: "session_not_found",
            },
            "ws rejected",
          );
          ws.close(4004, "Session not found");
          return;
        }

        if (session.status !== "active") {
          logger.warn(
            {
              sessionId,
              clientId: currentClientId,
              reason: "session_not_active",
            },
            "ws rejected",
          );
          ws.close(4003, "Session not active — call activate first");
          return;
        }

        if (!session.sandboxProvider || !session.sandboxProviderId) {
          logger.warn(
            {
              sessionId,
              clientId: currentClientId,
              reason: "sandbox_not_provisioned",
            },
            "ws rejected",
          );
          ws.close(4003, "Sandbox not provisioned");
          return;
        }

        // Get or create hub for this session
        const hub = sessionHubManager.getOrCreate(sessionId);

        // Add client to hub (this attaches to sandbox if needed)
        try {
          await hub.addClient(
            {
              id: currentClientId,
              ws,
              capabilities: { extensionUI: false }, // Will be updated via REST
              connectedAt: new Date(),
            },
            lastSeq,
          );
        } catch (err) {
          logger.error(
            { err, sessionId, clientId: currentClientId },
            "ws add client failed",
          );
          ws.close(4003, "Failed to attach to sandbox");
        }
      },

      onMessage(evt, _ws) {
        if (!sessionId) return;

        const hub = sessionHubManager.get(sessionId);
        if (!hub) {
          logger.warn(
            { sessionId, clientId: currentClientId },
            "message received but no hub exists",
          );
          return;
        }

        try {
          const data =
            typeof evt.data === "string"
              ? evt.data
              : evt.data instanceof ArrayBuffer
                ? new TextDecoder().decode(evt.data)
                : evt.data instanceof Buffer
                  ? evt.data.toString()
                  : "";

          const parsed = JSON.parse(data);

          if (isClientCommand(parsed)) {
            logger.debug(
              { sessionId, clientId: currentClientId, cmdType: parsed.type },
              "ws cmd",
            );
            hub.handleClientCommand(currentClientId, parsed);
            // Touch session activity
            sessionService.touch(sessionId);
          } else {
            // Send error directly to this client via hub's internal method
            // Since we don't have direct access, we need to handle this differently
            // For now, log and ignore
            logger.warn(
              { sessionId, clientId: currentClientId, parsed },
              "unknown command type",
            );
          }
        } catch (err) {
          const raw =
            typeof evt.data === "string"
              ? evt.data
              : evt.data instanceof Buffer
                ? evt.data.toString()
                : String(evt.data);
          logger.error(
            {
              err,
              sessionId,
              clientId: currentClientId,
              raw: raw.slice(0, 500),
            },
            "failed to parse client message",
          );
        }
      },

      onClose(_evt, _ws) {
        logger.info({ sessionId, clientId: currentClientId }, "ws closed");
        if (sessionId) {
          const hub = sessionHubManager.get(sessionId);
          if (hub) {
            hub.removeClient(currentClientId);
            // Clean up empty hub after a delay (allowing for reconnect)
            setTimeout(() => {
              sessionHubManager.removeIfEmpty(sessionId);
            }, DETACH_GRACE_MS + 1000);
          }
        }
      },

      onError(evt, _ws) {
        logger.error(
          { sessionId, clientId: currentClientId, error: String(evt) },
          "ws error",
        );
        if (sessionId) {
          const hub = sessionHubManager.get(sessionId);
          if (hub) {
            hub.removeClient(currentClientId);
          }
        }
      },
    };
  });
}
