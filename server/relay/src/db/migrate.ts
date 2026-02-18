import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { createLogger } from "../lib/logger";

const log = createLogger("db:migrate");

/**
 * Run SQL migrations from the migrations directory.
 * Migrations are applied in alphabetical order.
 * Uses a _drizzle_migrations table to track applied migrations.
 */
export function runMigrations(
  sqlite: Database.Database,
  migrationsDir: string,
): void {
  // Create migrations tracking table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);

  if (!existsSync(migrationsDir)) {
    log.info("no migrations directory found, skipping");
    return;
  }

  // Get list of migration files
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    log.info("no migration files found");
    return;
  }

  // Get already applied migrations
  const applied = new Set(
    sqlite
      .prepare("SELECT name FROM _drizzle_migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  // Apply pending migrations
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    log.info({ file }, "applying migration");
    const sql = readFileSync(join(migrationsDir, file), "utf-8");

    // Split by statement breakpoint marker and execute each statement
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim());

    sqlite.transaction(() => {
      for (const statement of statements) {
        if (statement) {
          sqlite.exec(statement);
        }
      }
      sqlite
        .prepare(
          "INSERT INTO _drizzle_migrations (name, applied_at) VALUES (?, ?)",
        )
        .run(file, new Date().toISOString());
    })();

    log.info({ file }, "applied migration");
  }
}
