import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// -- environments ---------------------------------------------
export const environments = sqliteTable("environments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sandboxType: text("sandbox_type", {
    enum: ["docker", "cloudflare"],
  }).notNull(),
  config: text("config").notNull(), // JSON string: { image, resources? }
  isDefault: integer("is_default", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// -- sessions -------------------------------------------------
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  mode: text("mode", { enum: ["chat", "code"] }).notNull(),
  status: text("status", {
    enum: ["creating", "active", "suspended", "error", "deleted"],
  })
    .notNull()
    .default("creating"),
  sandboxProvider: text("sandbox_provider", {
    enum: ["mock", "docker", "cloudflare"],
  }),
  sandboxProviderId: text("sandbox_provider_id"),
  environmentId: text("environment_id").references(() => environments.id),
  sandboxImageDigest: text("sandbox_image_digest"),
  repoId: text("repo_id"),
  repoPath: text("repo_path"),
  branchName: text("branch_name"),
  name: text("name"),
  currentModelProvider: text("current_model_provider"),
  currentModelId: text("current_model_id"),
  systemPrompt: text("system_prompt"),
  createdAt: text("created_at").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
});

// -- events (append-only journal) -----------------------------
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("events_session_seq_idx").on(table.sessionId, table.seq),
    index("events_session_created_idx").on(table.sessionId, table.createdAt),
  ],
);

// -- repos ----------------------------------------------------
export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  owner: text("owner").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" })
    .notNull()
    .default(false),
  description: text("description"),
  htmlUrl: text("html_url"),
  cloneUrl: text("clone_url"),
  sshUrl: text("ssh_url"),
  defaultBranch: text("default_branch"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// -- settings (key-value store) --------------------------------
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// -- secrets (encrypted values) --------------------------------
export const secrets = sqliteTable(
  "secrets",
  {
    /** UUID primary key */
    id: text("id").primaryKey(),
    /** Human-readable display label */
    name: text("name").notNull(),
    /** Environment variable name to inject into sandbox (stored as-is, trimmed) */
    envVar: text("env_var").notNull(),
    /** Grouping kind: ai_provider for model credentials, env_var for arbitrary env */
    kind: text("kind", { enum: ["ai_provider", "env_var"] })
      .notNull()
      .default("env_var"),
    /** Whether this secret is injected into new sandboxes */
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** Base64-encoded initialization vector */
    iv: text("iv").notNull(),
    /** Base64-encoded encrypted value */
    ciphertext: text("ciphertext").notNull(),
    /** Base64-encoded authentication tag */
    tag: text("tag").notNull(),
    /** Encryption key version (for rotation) */
    keyVersion: integer("key_version").notNull().default(1),
    /** ISO timestamp of creation */
    createdAt: text("created_at").notNull(),
    /** ISO timestamp of last update */
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("secrets_env_var_idx").on(table.envVar)],
);

// Type exports
export type Environment = typeof environments.$inferSelect;
export type NewEnvironment = typeof environments.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
