import type { UpgradeWebSocket, WSContext } from "hono/ws";
import { createLogger } from "../lib/logger";
import { resolveEnvConfig, type SandboxManager } from "../sandbox/manager";
import type { PtyHandle } from "../sandbox/types";
import type { EnvironmentService } from "../services/environment.service";
import type { SecretsService } from "../services/secrets.service";
import type { SessionService } from "../services/session.service";

const logger = createLogger("ws-terminal");

export interface TerminalHandlerDeps {
  sandboxManager: SandboxManager;
  sessionService: SessionService;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
}

/**
 * WebSocket handler for interactive terminal sessions.
 *
 * Protocol (JSON messages):
 *   Client -> Server:
 *     { type: "input", data: string }     - User keyboard input
 *     { type: "resize", cols: number, rows: number } - Terminal resize
 *
 *   Server -> Client:
 *     { type: "output", data: string }    - PTY output
 *     { type: "exit", exitCode: number }  - PTY exited
 *     { type: "error", message: string }  - Error message
 */
export function createTerminalHandler(
  upgradeWebSocket: UpgradeWebSocket,
  deps: TerminalHandlerDeps,
) {
  const { sessionService, sandboxManager, environmentService, secretsService } =
    deps;

  return upgradeWebSocket((c) => {
    const sessionId = c.req.param("id");
    const colsParam = c.req.query("cols");
    const rowsParam = c.req.query("rows");
    const cols = colsParam ? Number.parseInt(colsParam, 10) : 80;
    const rows = rowsParam ? Number.parseInt(rowsParam, 10) : 24;

    let pty: PtyHandle | null = null;
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;

    return {
      async onOpen(_evt: unknown, ws: WSContext) {
        logger.info({ sessionId, cols, rows }, "terminal ws open");

        const session = sessionId ? sessionService.get(sessionId) : null;
        if (!session || session.status === "archived") {
          ws.send(
            JSON.stringify({ type: "error", message: "Session not found" }),
          );
          ws.close(4004, "Session not found");
          return;
        }

        if (!session.sandboxProvider || !session.sandboxProviderId) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "No sandbox provisioned",
            }),
          );
          ws.close(4003, "No sandbox provisioned");
          return;
        }

        try {
          // Resolve environment config for the sandbox handle lookup
          const env = session.environmentId
            ? environmentService.get(session.environmentId)
            : environmentService.getDefault();
          const envConfig = env
            ? await resolveEnvConfig(env, secretsService)
            : undefined;

          const handle = await sandboxManager.getHandleByType(
            session.sandboxProvider as "docker" | "gondolin" | "cloudflare",
            session.sandboxProviderId,
            envConfig,
          );

          if (!handle.openPty) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Terminal not supported by this sandbox provider",
              }),
            );
            ws.close(4003, "Terminal not supported");
            return;
          }

          pty = await handle.openPty(cols, rows);

          cleanupData = pty.onData((data) => {
            try {
              ws.send(JSON.stringify({ type: "output", data }));
            } catch {
              // WebSocket may be closed
            }
          });

          cleanupExit = pty.onExit((exitCode) => {
            try {
              ws.send(JSON.stringify({ type: "exit", exitCode }));
              ws.close(1000, "PTY exited");
            } catch {
              // WebSocket may be closed
            }
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to open terminal";
          logger.error({ err, sessionId }, "terminal open failed");
          ws.send(JSON.stringify({ type: "error", message }));
          ws.close(4003, "Failed to open terminal");
        }
      },

      onMessage(evt: { data: unknown }) {
        if (!pty) return;

        try {
          const raw =
            typeof evt.data === "string"
              ? evt.data
              : evt.data instanceof ArrayBuffer
                ? new TextDecoder().decode(evt.data)
                : evt.data instanceof Buffer
                  ? evt.data.toString()
                  : "";

          const msg = JSON.parse(raw) as {
            type: string;
            data?: string;
            cols?: number;
            rows?: number;
          };

          if (msg.type === "input" && typeof msg.data === "string") {
            pty.write(msg.data);
          } else if (
            msg.type === "resize" &&
            typeof msg.cols === "number" &&
            typeof msg.rows === "number"
          ) {
            pty.resize(msg.cols, msg.rows);
          }
        } catch (err) {
          logger.warn({ err, sessionId }, "terminal: failed to parse message");
        }
      },

      onClose() {
        logger.info({ sessionId }, "terminal ws closed");
        cleanupData?.();
        cleanupExit?.();
        pty?.close();
        pty = null;
      },

      onError(evt: unknown) {
        logger.error({ sessionId, error: String(evt) }, "terminal ws error");
        cleanupData?.();
        cleanupExit?.();
        pty?.close();
        pty = null;
      },
    };
  });
}
