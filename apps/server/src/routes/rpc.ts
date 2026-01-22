/**
 * WebSocket RPC endpoint.
 */

import type { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { SessionManager } from "../session/manager";
import type { ConnectionManager } from "../ws/connection";
import { type HandlerContext, handleMessage } from "../ws/handler";

interface RpcRouteOptions {
  app: Hono;
  upgradeWebSocket: ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];
  connectionManager: ConnectionManager;
  sessionManager: SessionManager;
  dataDir: string;
}

/**
 * Register the /rpc WebSocket endpoint.
 */
export function registerRpcRoute(options: RpcRouteOptions): void {
  const { app, upgradeWebSocket, connectionManager, sessionManager, dataDir } = options;

  app.get(
    "/rpc",
    upgradeWebSocket(() => {
      const connectionId = crypto.randomUUID();

      return {
        onOpen(_event, ws) {
          const rawWs = ws.raw;
          if (!rawWs) {
            console.error("WebSocket raw instance not available");
            return;
          }
          connectionManager.registerConnection(connectionId, rawWs);
          console.log(`WebSocket connected: ${connectionId}`);
        },

        async onMessage(event, _ws) {
          const connection = connectionManager.getConnection(connectionId);
          if (!connection) {
            console.error(`No connection found for ${connectionId}`);
            return;
          }

          const data = typeof event.data === "string" ? event.data : String(event.data);

          const ctx: HandlerContext = {
            connection,
            connectionManager,
            sessionManager,
            dataDir,
          };

          try {
            await handleMessage(ctx, data);
          } catch (error) {
            console.error("Error handling message:", error);
          }
        },

        onClose(_event, _ws) {
          connectionManager.removeConnection(connectionId);
          console.log(`WebSocket disconnected: ${connectionId}`);
        },

        onError(event, _ws) {
          console.error(`WebSocket error for ${connectionId}:`, event);
        },
      };
    }),
  );
}
