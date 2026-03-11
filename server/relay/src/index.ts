import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { ensureDataDirs, parseConfig } from "./config";
import { createDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { settings } from "./db/schema";
import {
  getIdleCheckIntervalMs,
  getRelayEncryptionKey,
  getRelayEncryptionKeyVersion,
  loadEnv,
} from "./env";
import { createLogger } from "./lib/logger";
import { SandboxLogStore } from "./sandbox/log-store";
import { resolveEnvConfig, SandboxManager } from "./sandbox/manager";
import { CryptoService } from "./services/crypto.service";
import { EnvironmentService } from "./services/environment.service";
import { EventJournal } from "./services/event-journal";
import { ExtensionConfigService } from "./services/extension-config.service";
import { ExtensionManifestService } from "./services/extension-manifest.service";
import { GitHubService } from "./services/github.service";
import { GitHubAppService } from "./services/github-app.service";
import { IdleReaper } from "./services/idle-reaper";
import { PackageCatalogService } from "./services/package-catalog.service";
import { RepoService } from "./services/repo.service";
import { SecretsService } from "./services/secrets.service";
import { SessionService } from "./services/session.service";
import { createWebSocketHandler } from "./ws/handler";
import { buildEventHooks } from "./ws/hooks";
import { SessionHubManager } from "./ws/session-hub";
import { createTerminalHandler } from "./ws/terminal";

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

  // Initialize GitHub App service
  const githubAppService = new GitHubAppService(db, secretsService);
  log.info("github app service initialized");

  // Initialize GitHub service (with app service support)
  const githubService = new GitHubService({
    githubAppService,
    getPat: () => {
      // Provide PAT getter for backward compatibility
      const row = db
        .select()
        .from(settings)
        .where(eq(settings.key, "github_repos_access_token"))
        .get();
      if (!row) return undefined;
      try {
        return JSON.parse(row.value) as string;
      } catch {
        return row.value;
      }
    },
  });
  log.info("github service initialized");

  // Initialize sandbox manager -- providers are built on-demand from
  // per-environment config. CF API token is fetched from secrets table.
  const sessionDataDir = join(paths.stateDir, "sessions");

  const sandboxLogStore = new SandboxLogStore();
  const sandboxManager = new SandboxManager(
    {
      docker: {
        sessionDataDir,
        secretsBaseDir: paths.stateDir,
      },
      gondolin: {
        sessionDataDir,
      },
      logStore: sandboxLogStore,
    },
    secretsService,
  );
  log.info("sandbox manager initialized (on-demand providers)");

  // Initialize environment service
  const environmentService = new EnvironmentService(db);
  log.info("environment service initialized");

  // Initialize extension services
  const extensionConfigService = new ExtensionConfigService(db);
  const extensionManifestService = new ExtensionManifestService();
  const packageCatalogService = new PackageCatalogService(
    extensionManifestService,
  );
  log.info("extension services initialized");

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
      githubAppService,
      sandboxManager,
      secretsService,
      environmentService,
      extensionConfigService,
      sandboxLogStore,
      sessionDataDir,
      sessionHubManager,
      packageCatalogService,
    },
  });

  // Create WebSocket adapter with the app
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  // Now mount the WebSocket handler
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
  const terminalHandler = createTerminalHandler(upgradeWebSocket, {
    sandboxManager,
    sessionService,
    environmentService,
    secretsService,
  });
  app.get("/ws/sessions/:id/terminal", terminalHandler);

  // Start idle reaper
  const reaper = new IdleReaper({
    db,
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
