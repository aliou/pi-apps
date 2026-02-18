import type { UpgradeWebSocket } from "hono/ws";
import { createLogger } from "../lib/logger";
import type { SandboxManager } from "../sandbox/manager";
import { resolveEnvConfig } from "../sandbox/manager";
import type { SandboxProviderType } from "../sandbox/provider-types";
import type { EnvironmentService } from "../services/environment.service";
import type { EventJournal } from "../services/event-journal";
import type { SecretsService } from "../services/secrets.service";
import type { SessionService } from "../services/session.service";
import { type ConnectionManager, WebSocketConnection } from "./connection";
import { registerFirstMessageHook } from "./hooks/first-message";
import { EventHookRegistry } from "./hooks/registry";
import { registerSessionNameHooks } from "./hooks/session-name";
import { isClientCommand } from "./types";

const logger = createLogger("ws");

export interface WebSocketHandlerDeps {
  sandboxManager: SandboxManager;
  sessionService: SessionService;
  eventJournal: EventJournal;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
}

/**
 * Build the event hook registry with all server-side hooks.
 */
export function buildEventHooks(
  sessionService: SessionService,
): EventHookRegistry {
  const hooks = new EventHookRegistry();
  registerSessionNameHooks(hooks, sessionService);
  registerFirstMessageHook(hooks, sessionService);
  return hooks;
}

export function createWebSocketHandler(
  upgradeWebSocket: UpgradeWebSocket,
  deps: WebSocketHandlerDeps,
  connectionManager: ConnectionManager,
) {
  const {
    sandboxManager,
    sessionService,
    eventJournal,
    environmentService,
    secretsService,
  } = deps;

  const eventHooks = buildEventHooks(sessionService);

  return upgradeWebSocket((c) => {
    const sessionId = c.req.param("id");
    const lastSeqParam = c.req.query("lastSeq");
    const lastSeq = lastSeqParam ? Number.parseInt(lastSeqParam, 10) : 0;

    let connection: WebSocketConnection | null = null;

    return {
      async onOpen(_evt, ws) {
        logger.info({ sessionId, lastSeq }, "ws open");

        // Validate session exists and is active
        const session = sessionId ? sessionService.get(sessionId) : null;
        if (!session || session.status === "archived") {
          logger.warn(
            { sessionId, reason: "session_not_found" },
            "ws rejected",
          );
          ws.close(4004, "Session not found");
          return;
        }

        if (session.status !== "active") {
          logger.warn(
            { sessionId, reason: "session_not_active" },
            "ws rejected",
          );
          ws.close(4003, "Session not active — call activate first");
          return;
        }

        if (!session.sandboxProvider || !session.sandboxProviderId) {
          logger.warn(
            { sessionId, reason: "sandbox_not_provisioned" },
            "ws rejected",
          );
          ws.close(4003, "Sandbox not provisioned");
          return;
        }

        // Attach streams (sandbox is already running thanks to activate)
        const providerType = session.sandboxProvider as SandboxProviderType;
        const providerId = session.sandboxProviderId;

        // Resolve environment config for the sandbox provider
        let envConfig:
          | import("../sandbox/manager").EnvironmentSandboxConfig
          | undefined;
        if (session.environmentId) {
          const env = environmentService.get(session.environmentId);
          if (env) {
            envConfig = await resolveEnvConfig(env, secretsService);
          }
        }

        sandboxManager
          .attachSession(providerType, providerId, envConfig)
          .then(({ channel }) => {
            logger.info({ sessionId }, "ws attached");
            connection = new WebSocketConnection(
              ws,
              sessionId,
              channel,
              eventJournal,
              eventHooks,
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
            logger.error({ err, sessionId }, "ws attach failed");
            ws.close(4003, "Failed to attach to sandbox");
          });
      },

      onMessage(evt, _ws) {
        if (!connection || !sessionId) return;

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
            logger.debug({ sessionId, cmdType: parsed.type }, "ws cmd");
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
        } catch (err) {
          const raw =
            typeof evt.data === "string"
              ? evt.data
              : evt.data instanceof Buffer
                ? evt.data.toString()
                : String(evt.data);
          logger.error(
            { err, sessionId, raw: raw.slice(0, 500) },
            "failed to parse client message",
          );
          connection.send({
            type: "error",
            code: "PARSE_ERROR",
            message: "Invalid JSON",
          });
        }
      },

      onClose(_evt, _ws) {
        logger.info({ sessionId }, "ws closed");
        if (connection && sessionId) {
          // Remove from connection manager
          connectionManager.remove(sessionId, connection);
          connection.close();

          // Note: sandbox keeps running, events keep being journaled
          // This allows reconnection without losing state
        }
      },

      onError(evt, _ws) {
        logger.error({ sessionId, error: String(evt) }, "ws error");
        if (connection && sessionId) {
          connectionManager.remove(sessionId, connection);
          connection.close();
        }
      },
    };
  });
}
