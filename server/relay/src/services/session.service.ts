import { desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { repos, type Session, sessions } from "../db/schema";
import type { SandboxProviderType } from "../sandbox/provider-types";

export type SessionStatus =
  | "creating"
  | "active"
  | "idle"
  | "archived"
  | "error";
export type SessionMode = "chat" | "code";

export interface CreateSessionParams {
  mode: SessionMode;
  repoId?: string;
  repoPath?: string;
  branchName?: string;
  systemPrompt?: string;
  modelProvider?: string;
  modelId?: string;
  sandboxProvider?: SandboxProviderType;
  sandboxProviderId?: string;
  environmentId?: string;
}

export interface UpdateSessionParams {
  status?: SessionStatus;
  name?: string;
  firstUserMessage?: string;
  repoPath?: string;
  branchName?: string;
  currentModelProvider?: string;
  currentModelId?: string;
  sandboxImageDigest?: string;
  sandboxProviderId?: string;
}

export type SessionRecord = Session & {
  repoFullName?: string | null;
};

export class SessionService {
  constructor(private db: AppDatabase) {}

  /**
   * Create a new session.
   * Code mode requires repoId.
   */
  create(params: CreateSessionParams): SessionRecord {
    if (params.mode === "code" && !params.repoId) {
      throw new Error("repoId is required for code mode sessions");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const newSession = {
      id,
      mode: params.mode,
      status: "creating" as SessionStatus,
      sandboxProvider: params.sandboxProvider ?? null,
      sandboxProviderId: params.sandboxProviderId ?? null,
      environmentId: params.environmentId ?? null,
      sandboxImageDigest: null as string | null,
      repoId: params.repoId ?? null,
      repoPath: params.repoPath ?? null,
      branchName: params.branchName ?? null,
      systemPrompt: params.systemPrompt ?? null,
      currentModelProvider: params.modelProvider ?? null,
      currentModelId: params.modelId ?? null,
      name: null,
      firstUserMessage: null,
      createdAt: now,
      lastActivityAt: now,
    };

    this.db.insert(sessions).values(newSession).run();

    // biome-ignore lint/style/noNonNullAssertion: just inserted
    return this.get(id)!;
  }

  /**
   * Get a session by ID.
   * Returns undefined if not found or deleted.
   */
  get(sessionId: string): SessionRecord | undefined {
    const row = this.db
      .select({
        session: sessions,
        repoFullName: repos.fullName,
      })
      .from(sessions)
      .leftJoin(repos, eq(repos.id, sessions.repoId))
      .where(eq(sessions.id, sessionId))
      .get();

    if (!row) {
      return undefined;
    }

    return {
      ...row.session,
      repoFullName: row.repoFullName ?? null,
    };
  }

  /**
   * List sessions, ordered by lastActivityAt desc.
   * By default returns all sessions. Pass status to filter.
   */
  list(options?: { status?: SessionStatus[] }): SessionRecord[] {
    let query = this.db
      .select({
        session: sessions,
        repoFullName: repos.fullName,
      })
      .from(sessions)
      .leftJoin(repos, eq(repos.id, sessions.repoId))
      .$dynamic();

    if (options?.status && options.status.length > 0) {
      query = query.where(inArray(sessions.status, options.status));
    }

    const rows = query.orderBy(desc(sessions.lastActivityAt)).all();

    return rows.map((row) => ({
      ...row.session,
      repoFullName: row.repoFullName ?? null,
    }));
  }

  /**
   * Update session fields.
   * Also bumps lastActivityAt.
   */
  update(sessionId: string, fields: UpdateSessionParams): void {
    const existing = this.get(sessionId);
    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updates: Record<string, unknown> = {
      lastActivityAt: new Date().toISOString(),
    };

    if (fields.status !== undefined) {
      updates.status = fields.status;
    }
    if (fields.name !== undefined) {
      updates.name = fields.name;
    }
    if (fields.firstUserMessage !== undefined) {
      updates.firstUserMessage = fields.firstUserMessage;
    }
    if (fields.repoPath !== undefined) {
      updates.repoPath = fields.repoPath;
    }
    if (fields.branchName !== undefined) {
      updates.branchName = fields.branchName;
    }
    if (fields.currentModelProvider !== undefined) {
      updates.currentModelProvider = fields.currentModelProvider;
    }
    if (fields.currentModelId !== undefined) {
      updates.currentModelId = fields.currentModelId;
    }
    if (fields.sandboxImageDigest !== undefined) {
      updates.sandboxImageDigest = fields.sandboxImageDigest;
    }
    if (fields.sandboxProviderId !== undefined) {
      updates.sandboxProviderId = fields.sandboxProviderId;
    }

    this.db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, sessionId))
      .run();
  }

  /**
   * Archive a session (soft delete). Sets status to "archived".
   */
  archive(sessionId: string): void {
    this.db
      .update(sessions)
      .set({
        status: "archived",
        lastActivityAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  /**
   * Hard delete a session and its events (via cascade).
   */
  delete(sessionId: string): void {
    this.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }

  /**
   * List all sessions with status 'active'.
   */
  listActiveSessions(): SessionRecord[] {
    const rows = this.db
      .select({
        session: sessions,
        repoFullName: repos.fullName,
      })
      .from(sessions)
      .leftJoin(repos, eq(repos.id, sessions.repoId))
      .where(eq(sessions.status, "active"))
      .all();

    return rows.map((row) => ({
      ...row.session,
      repoFullName: row.repoFullName ?? null,
    }));
  }

  /**
   * Bump lastActivityAt to current time.
   */
  touch(sessionId: string): void {
    const now = new Date().toISOString();
    this.db
      .update(sessions)
      .set({ lastActivityAt: now })
      .where(eq(sessions.id, sessionId))
      .run();
  }
}
