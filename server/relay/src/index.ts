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
import { createLogger } from "./lib/logger";
import { SandboxLogStore } from "./sandbox/log-store";
import { SandboxManager } from "./sandbox/manager";
import { CryptoService } from "./services/crypto.service";
import { EnvironmentService } from "./services/environment.service";
import { EventJournal } from "./services/event-journal";
import { ExtensionConfigService } from "./services/extension-config.service";
import { GitHubService } from "./services/github.service";
import { IdleReaper } from "./services/idle-reaper";
import { RepoService } from "./services/repo.service";
import { SecretsService } from "./services/secrets.service";
import { SessionService } from "./services/session.service";
import { buildEventHooks } from "./ws/hooks";
import { SessionHubManager } from "./ws/session-hub";

const VERSION = "0.1.0";

const log = createLogger("server");

async function main() {
  // Parse CLI args
  const config = parseConfig(process.argv.slice(2));

  log.info({ version: VERSION }, "pi-relay starting");
  log.info(
    {
      dataDir: config.dataDir,
      configDir: config.configDir,
      cacheDir: config.cacheDir,
      stateDir: config.stateDir,
    },
    "directories",
  );

  // Ensure all directories exist
  const paths = ensureDataDirs(config);

  // Load .env from config directory
  loadEnv(paths.configDir);

  // Initialize database
  log.info({ dbPath: paths.dbPath }, "database");
  const { db, sqlite } = createDatabase(paths.dbPath);

  // Run migrations
  log.info("running migrations");
  runMigrations(sqlite, paths.migrationsDir);

  // Initialize services
  const sessionService = new SessionService(db);
  const eventJournal = new EventJournal(db);
  const repoService = new RepoService(db);
  const githubService = new GitHubService();

  // Initialize secrets service (required)
  const encryptionKey = getRelayEncryptionKey();
  if (!encryptionKey) {
    log.fatal(
      "RELAY_ENCRYPTION_KEY is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
    process.exit(1);
  }

  const cryptoService = new CryptoService(
    encryptionKey,
    getRelayEncryptionKeyVersion(),
  );
  const secretsService = new SecretsService(db, cryptoService);
  log.info("secrets service initialized");

  // Initialize sandbox manager -- providers are built on-demand from
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
  log.info("sandbox manager initialized (on-demand providers)");

  // Load initial secrets snapshot for new sandbox creations
  const initialSecrets = await secretsService.getAllAsEnv();
  sandboxManager.setSecrets(initialSecrets);
  log.info({ count: Object.keys(initialSecrets).length }, "secrets loaded");

  // Initialize environment service
  const environmentService = new EnvironmentService(db);
  log.info("environment service initialized");

  // Initialize extension config service
  const extensionConfigService = new ExtensionConfigService(db);
  log.info("extension config service initialized");

  // Initialize session hub manager for multi-client streaming
  const eventHooks = buildEventHooks(sessionService);
  const sessionHubManager = new SessionHubManager({
    sandboxManager,
    sessionService,
    eventJournal,
    environmentService,
    secretsService,
    eventHooks,
  });
  log.info("session hub manager initialized");

  // Prune old events on startup (7 days)
  const cutoffDate = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const pruned = eventJournal.pruneOlderThan(cutoffDate);
  if (pruned > 0) {
    log.info({ pruned }, "pruned old events");
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
      extensionConfigService,
      sandboxLogStore,
      sessionDataDir,
      sessionHubManager,
    },
  });

  // Create WebSocket adapter with the app
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Now mount the WebSocket handler
  const { createWebSocketHandler } = await import("./ws/handler");

  const wsHandler = createWebSocketHandler(upgradeWebSocket, {
    sandboxManager,
    sessionService,
    eventJournal,
    environmentService,
    secretsService,
    sessionHubManager,
  });
  app.get("/ws/sessions/:id", wsHandler);

  // Terminal WebSocket handler
  const { createTerminalHandler } = await import("./ws/terminal");
  const terminalHandler = createTerminalHandler(upgradeWebSocket, {
    sandboxManager,
    sessionService,
    environmentService,
    secretsService,
  });
  app.get("/ws/sessions/:id/terminal", terminalHandler);

  // Start idle reaper
  const { resolveEnvConfig } = await import("./sandbox/manager");
  const reaper = new IdleReaper({
    sessionService,
    environmentService,
    secretsService,
    sandboxManager,
    sessionHubManager,
    resolveEnvConfig,
    checkIntervalMs: getIdleCheckIntervalMs(),
  });
  reaper.start();
  log.info(
    { checkIntervalMs: getIdleCheckIntervalMs() },
    "idle reaper started",
  );

  // Start server with WebSocket support
  const server = serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  });

  // Inject WebSocket into server
  injectWebSocket(server);

  log.info({ host: config.host, port: config.port }, "server listening");

  // Graceful shutdown
  const shutdown = (code = 0, err?: unknown) => {
    if (err) {
      log.fatal({ err }, "fatal error");
    } else {
      log.info("shutting down");
    }

    try {
      reaper.stop();
      sessionHubManager.closeAll();
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
  log.fatal({ err }, "failed to start");
  process.exit(1);
});
