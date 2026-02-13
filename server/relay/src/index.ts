import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./app";
import { ensureDataDirs, parseConfig } from "./config";
import { createDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import {
  getIdleCheckIntervalMs,
  getRelayEncryptionKey,
  getRelayEncryptionKeyVersion,
  loadEnv,
} from "./env";
import { SandboxLogStore } from "./sandbox/log-store";
import { SandboxManager } from "./sandbox/manager";
import { CryptoService } from "./services/crypto.service";
import { EnvironmentService } from "./services/environment.service";
import { EventJournal } from "./services/event-journal";
import { GitHubService } from "./services/github.service";
import { IdleReaper } from "./services/idle-reaper";
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

  // Initialize sandbox manager — providers are built on-demand from
  // per-environment config. CF API token is fetched from secrets table.
  const sessionDataDir = join(paths.stateDir, "sessions");

  const sandboxLogStore = new SandboxLogStore();
  const sandboxManager = new SandboxManager({
    docker: {
      sessionDataDir,
      secretsBaseDir: paths.stateDir,
    },
    gondolin: {
      sessionDataDir,
    },
    logStore: sandboxLogStore,
  });
  console.log("Sandbox manager initialized (on-demand providers)");

  // Load initial secrets snapshot for new sandbox creations
  const initialSecrets = await secretsService.getAllAsEnv();
  sandboxManager.setSecrets(initialSecrets);
  console.log(
    `Secrets loaded: ${Object.keys(initialSecrets).length} enabled secret(s)`,
  );

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
      sandboxLogStore,
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
      environmentService,
      secretsService,
    },
    connectionManager,
  );
  app.get("/ws/sessions/:id", wsHandler);

  // Start idle reaper
  const { resolveEnvConfig } = await import("./sandbox/manager");
  const reaper = new IdleReaper({
    sessionService,
    environmentService,
    secretsService,
    sandboxManager,
    connectionManager,
    resolveEnvConfig,
    checkIntervalMs: getIdleCheckIntervalMs(),
  });
  reaper.start();
  console.log(
    `Idle reaper started (check interval: ${getIdleCheckIntervalMs()}ms)`,
  );

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
      reaper.stop();
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
