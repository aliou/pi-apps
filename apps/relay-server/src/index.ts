import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./app";
import { ensureDataDirs, parseConfig } from "./config";
import { createDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import {
  getRelayEncryptionKey,
  getRelayEncryptionKeyVersion,
  getSandboxDockerImage,
  getSandboxProvider,
  loadEnv,
} from "./env";
import { SandboxManager } from "./sandbox/manager";
import type { SandboxProviderType } from "./sandbox/provider-types";
import { CryptoService } from "./services/crypto.service";
import { EnvironmentService } from "./services/environment.service";
import { EventJournal } from "./services/event-journal";
import { GitHubService } from "./services/github.service";
import { RepoService } from "./services/repo.service";
import { SecretsService } from "./services/secrets.service";
import { SessionService } from "./services/session.service";

const VERSION = "0.1.0";

async function main() {
  // Parse CLI args
  const config = parseConfig(process.argv.slice(2));

  console.log(`pi-relay v${VERSION}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Config directory: ${config.configDir}`);
  console.log(`Cache directory: ${config.cacheDir}`);
  console.log(`State directory: ${config.stateDir}`);

  // Ensure all directories exist
  const paths = ensureDataDirs(config);

  // Load .env from config directory
  loadEnv(paths.configDir);

  // Initialize database
  console.log(`Database: ${paths.dbPath}`);
  const { db, sqlite } = createDatabase(paths.dbPath);

  // Run migrations
  console.log("Running migrations...");
  runMigrations(sqlite, paths.migrationsDir);

  // Initialize services
  const sessionService = new SessionService(db);
  const eventJournal = new EventJournal(db);
  const repoService = new RepoService(db);
  const githubService = new GitHubService();

  // Initialize secrets service (required)
  const encryptionKey = getRelayEncryptionKey();
  if (!encryptionKey) {
    console.error("RELAY_ENCRYPTION_KEY is required");
    console.error(
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
    process.exit(1);
  }

  const cryptoService = new CryptoService(
    encryptionKey,
    getRelayEncryptionKeyVersion(),
  );
  const secretsService = new SecretsService(db, cryptoService);
  console.log("Secrets service initialized");

  // Initialize sandbox manager based on config
  const sandboxProvider = getSandboxProvider();
  const sessionDataDir = join(paths.stateDir, "sessions");
  const sandboxManager = new SandboxManager({
    defaultProvider: sandboxProvider as SandboxProviderType,
    docker: {
      image: getSandboxDockerImage(),
      sessionDataDir, // Per-session host dirs for workspace + agent data
      secretsBaseDir: paths.stateDir, // Use state dir for temp secrets (Lima-compatible)
    },
  });
  console.log(
    `Default sandbox provider: ${sandboxManager.defaultProviderName}`,
  );
  console.log(
    `Enabled providers: ${sandboxManager.enabledProviders.join(", ")}`,
  );

  // Check availability on startup
  const available = await sandboxManager.isProviderAvailable();
  if (!available) {
    console.warn(`Sandbox provider "${sandboxProvider}" is not available`);
    if (sandboxProvider === "docker") {
      console.warn("Is Docker running?");
    }
  }

  // Initialize environment service
  const environmentService = new EnvironmentService(db);
  console.log("Environment service initialized");

  // Prune old events on startup (7 days)
  const cutoffDate = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const pruned = eventJournal.pruneOlderThan(cutoffDate);
  if (pruned > 0) {
    console.log(`Pruned ${pruned} old events`);
  }

  // Create app first (without WebSocket initially)
  const app = createApp({
    services: {
      db,
      sessionService,
      eventJournal,
      repoService,
      githubService,
      sandboxManager,
      secretsService,
      environmentService,
      sessionDataDir,
    },
  });

  // Create WebSocket adapter with the app
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Now mount the WebSocket handler
  const { ConnectionManager } = await import("./ws/connection");
  const { createWebSocketHandler } = await import("./ws/handler");

  const connectionManager = new ConnectionManager();
  const wsHandler = createWebSocketHandler(
    upgradeWebSocket,
    {
      sandboxManager,
      sessionService,
      eventJournal,
    },
    connectionManager,
  );
  app.get("/ws/sessions/:id", wsHandler);

  // Start server with WebSocket support
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  });

  // Inject WebSocket into server
  injectWebSocket(server);

  console.log(`Server listening on http://${config.host}:${config.port}`);
  console.log("Press Ctrl+C to stop");

  // Graceful shutdown
  const shutdown = (code = 0, err?: unknown) => {
    if (err) {
      console.error("Fatal error:", err);
    } else {
      console.log("\nShutting down...");
    }

    try {
      server.close();
      sqlite.close();
    } catch {
      // Ignore cleanup errors
    }

    setTimeout(() => process.exit(code), 250).unref();
  };

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  process.on("uncaughtException", (err) => shutdown(1, err));
  process.on("unhandledRejection", (reason) => shutdown(1, reason));
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
