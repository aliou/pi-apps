/**
 * Pi Server - WebSocket server for pi coding agent.
 *
 * Provides remote access to pi's AgentSession via WebSocket,
 * enabling iOS and other remote clients to use the coding agent.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { ensureDataDirs, parseArgs } from "./config.js";
import { SessionManager } from "./session/manager.js";
import { ConnectionManager } from "./ws/connection.js";
import { type HandlerContext, handleMessage } from "./ws/handler.js";

// WebSocket data type
interface WSData {
  connectionId: string;
}

// Parse CLI arguments
const config = parseArgs(process.argv.slice(2));

// Ensure data directories exist
ensureDataDirs(config.dataDir);

// Load .env from data directory if it exists
const envPath = join(config.dataDir, ".env");
if (existsSync(envPath)) {
  const envFile = Bun.file(envPath);
  const envContent = await envFile.text();
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);
        // Remove surrounding quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
  console.log(`  Loaded .env from: ${envPath}`);
}

console.log("Pi Server starting...");
console.log(`  Data directory: ${config.dataDir}`);
console.log(`  Listening on: ${config.host}:${config.port}`);

// Initialize managers
const connectionManager = new ConnectionManager();
const sessionManager = new SessionManager(config.dataDir);

// Set up session event forwarding
sessionManager.onEvent((sessionId, event) => {
  connectionManager.broadcastEvent(sessionId, event.type, event);
});

// Create Hono app
const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ ok: true, version: "0.1.0" });
});

// Info endpoint
app.get("/", (c) => {
  return c.json({
    name: "pi-server",
    version: "0.1.0",
    endpoints: {
      websocket: "/rpc",
      health: "/health",
    },
  });
});

// Start Bun server with WebSocket support
Bun.serve<WSData>({
  port: config.port,
  hostname: config.host,

  // HTTP handler (Hono)
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for /rpc
    if (url.pathname === "/rpc") {
      // Create connection before upgrade to get ID
      const connectionId = crypto.randomUUID();
      const upgraded = server.upgrade(req, { data: { connectionId } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Regular HTTP requests handled by Hono
    return app.fetch(req);
  },

  // WebSocket handlers
  websocket: {
    open(ws: ServerWebSocket<WSData>) {
      const { connectionId } = ws.data;
      connectionManager.registerConnection(
        connectionId,
        ws as unknown as WebSocket,
      );
      console.log(`WebSocket connected: ${connectionId}`);
    },

    async message(ws: ServerWebSocket<WSData>, message) {
      const { connectionId } = ws.data;
      const connection = connectionManager.getConnection(connectionId);

      if (!connection) {
        console.error(`No connection found for ${connectionId}`);
        return;
      }

      const data = typeof message === "string" ? message : message.toString();
      console.log(`[${connectionId.slice(0, 8)}] <- ${data.slice(0, 200)}`);

      const ctx: HandlerContext = {
        connection,
        connectionManager,
        sessionManager,
        dataDir: config.dataDir,
      };

      try {
        await handleMessage(ctx, data);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    },

    close(ws: ServerWebSocket<WSData>, code, reason) {
      const { connectionId } = ws.data;
      connectionManager.removeConnection(connectionId);
      console.log(
        `WebSocket disconnected: ${connectionId} (${code}: ${reason})`,
      );
    },
  },
});

console.log(`Pi Server running at http://${config.host}:${config.port}`);
console.log(`WebSocket endpoint: ws://${config.host}:${config.port}/rpc`);
