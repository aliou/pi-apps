import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { AppDatabase } from "./db/connection";
import * as schema from "./db/schema";
import { SandboxManager } from "./sandbox/manager";
import { CryptoService } from "./services/crypto.service";
import { SecretsService } from "./services/secrets.service";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create an in-memory test database with schema applied.
 */
export function createTestDatabase(): {
  db: AppDatabase;
  sqlite: Database.Database;
} {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // Apply migrations from the migrations directory
  const migrationsDir = join(__dirname, "./db/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim());
    for (const statement of statements) {
      if (statement) {
        sqlite.exec(statement);
      }
    }
  }

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/**
 * Generate a test session ID.
 */
export function testSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a test timestamp (ISO 8601).
 */
export function testTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Create a test sandbox manager that routes all provider types through mock.
 * Tests don't have Docker or Cloudflare available.
 */
export function createTestSandboxManager(): SandboxManager {
  const manager = new SandboxManager({
    docker: {
      sessionDataDir: "/tmp/pi-test-sessions",
      secretsBaseDir: "/tmp/pi-test-secrets",
    },
    gondolin: {
      sessionDataDir: "/tmp/pi-test-sessions",
    },
  });

  // Override createForSession to use mock provider in tests
  const mockCreate = manager.createMockForSession.bind(manager);
  manager.createForSession = async (sessionId, _envConfig, options) => {
    return mockCreate(sessionId, options);
  };

  // Override resumeSession to use mock provider
  const origResume = manager.resumeSession.bind(manager);
  manager.resumeSession = async (
    _providerType,
    providerId,
    _envConfig,
    secrets,
    githubToken,
  ) => {
    return origResume("mock", providerId, undefined, secrets, githubToken);
  };

  // Override attachSession to use mock provider
  const origAttach = manager.attachSession.bind(manager);
  manager.attachSession = async (_providerType, providerId, _envConfig) => {
    return origAttach("mock", providerId, undefined);
  };

  return manager;
}

/**
 * Create a test secrets service with a random encryption key.
 */
export function createTestSecretsService(db: AppDatabase): SecretsService {
  const testKey = CryptoService.generateKey();
  const crypto = new CryptoService(testKey);
  return new SecretsService(db, crypto);
}
