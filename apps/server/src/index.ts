/**
 * Pi Server - WebSocket server for pi coding agent.
 *
 * Provides remote access to pi's AgentSession via WebSocket,
 * enabling iOS and other remote clients to use the coding agent.
 */

import { readFileSync } from "node:fs";
import { createServer as createHttpsServer } from "node:https";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { ensureDataDirs, parseArgs } from "./config";
import { loadEnv } from "./env";
import { healthRoutes } from "./routes/health";
import { registerRpcRoute } from "./routes/rpc";
import { SessionManager } from "./session/manager";
import { ConnectionManager } from "./ws/connection";

// Parse CLI arguments
const config = parseArgs(process.argv.slice(2));

// Ensure data directories exist
ensureDataDirs(config.dataDir);

// Load environment
loadEnv(config.dataDir);

console.log("Pi Server starting...");
console.log(`  Data directory: ${config.dataDir}`);
console.log(`  Listening on: ${config.host}:${config.port}`);
if (config.tls) {
  console.log(`  TLS enabled: cert=${config.tls.cert}`);
}

// Initialize managers
const connectionManager = new ConnectionManager();
const sessionManager = new SessionManager(config.dataDir);

// Set up session event forwarding
sessionManager.onEvent((sessionId, event) => {
  connectionManager.broadcastEvent(sessionId, event.type, event);
});

// Create Hono app with WebSocket support
const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Register routes
app.route("/", healthRoutes);
registerRpcRoute({
  app,
  upgradeWebSocket,
  connectionManager,
  sessionManager,
  dataDir: config.dataDir,
});

// Build server options
const protocol = config.tls ? "https" : "http";
const wsProtocol = config.tls ? "wss" : "ws";

// biome-ignore lint/suspicious/noExplicitAny: @hono/node-server types don't expose full options
const serveOptions: any = {
  fetch: app.fetch,
  port: config.port,
  hostname: config.host === "::" ? "0.0.0.0" : config.host,
};

// Add TLS if configured
if (config.tls) {
  serveOptions.createServer = createHttpsServer;
  serveOptions.serverOptions = {
    cert: readFileSync(config.tls.cert),
    key: readFileSync(config.tls.key),
  };
}

// Start server
const server = serve(serveOptions, (info) => {
  console.log(`Pi Server running at ${protocol}://${info.address}:${info.port}`);
  console.log(`WebSocket endpoint: ${wsProtocol}://${info.address}:${info.port}/rpc`);
});

// Inject WebSocket handling
injectWebSocket(server);

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\nReceived ${signal}, shutting down...`);
  sessionManager.shutdown();
  server.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));
