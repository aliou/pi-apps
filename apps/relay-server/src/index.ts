import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp } from "./app";
import { ensureDataDirs, parseConfig } from "./config";
import { createDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { loadEnv, SANDBOX_DOCKER_IMAGE, SANDBOX_PROVIDER } from "./env";
import { SandboxManager, type SandboxProviderType } from "./sandbox/manager";
import { EventJournal } from "./services/event-journal";
import { GitHubService } from "./services/github.service";
import { RepoService } from "./services/repo.service";
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

  // Initialize sandbox manager based on config
  const sandboxManager = new SandboxManager({
    defaultProvider: SANDBOX_PROVIDER as SandboxProviderType,
    docker: {
      image: SANDBOX_DOCKER_IMAGE,
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
    console.warn(`Sandbox provider "${SANDBOX_PROVIDER}" is not available`);
    if (SANDBOX_PROVIDER === "docker") {
      console.warn("Is Docker running?");
    }
  }

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

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    sqlite.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

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
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
