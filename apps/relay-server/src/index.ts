import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { ensureDataDirs, parseConfig } from "./config";
import { createDatabase } from "./db/connection";
import { runMigrations } from "./db/migrate";
import { loadEnv } from "./env";
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

  // Prune old events on startup (7 days)
  const cutoffDate = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const pruned = eventJournal.pruneOlderThan(cutoffDate);
  if (pruned > 0) {
    console.log(`Pruned ${pruned} old events`);
  }

  // Create app
  const app = createApp({
    db,
    sessionService,
    eventJournal,
    repoService,
    githubService,
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    sqlite.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start server
  serve({
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  });

  console.log(`Server listening on http://${config.host}:${config.port}`);
  console.log("Press Ctrl+C to stop");
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
