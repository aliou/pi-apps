import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(dbPath: string): { db: AppDatabase; sqlite: Database.Database } {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}
