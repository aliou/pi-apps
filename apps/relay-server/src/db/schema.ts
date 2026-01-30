import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// -- sessions -------------------------------------------------
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  mode: text("mode", { enum: ["chat", "code"] }).notNull(),
  status: text("status", {
    enum: ["creating", "ready", "running", "stopped", "error", "deleted"],
  })
    .notNull()
    .default("creating"),
  sandboxProvider: text("sandbox_provider", { enum: ["mock", "docker"] }),
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

// Type exports
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
