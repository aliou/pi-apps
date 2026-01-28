import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, testSessionId, testTimestamp } from "../test-helpers";
import type { AppDatabase } from "./connection";
import * as schema from "./schema";

describe("Database", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("sessions table", () => {
    it("creates and retrieves a session", () => {
      const id = testSessionId();
      const now = testTimestamp();

      db.insert(schema.sessions)
        .values({
          id,
          mode: "chat",
          status: "creating",
          createdAt: now,
          lastActivityAt: now,
        })
        .run();

      const result = db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();

      expect(result).toBeDefined();
      expect(result?.id).toBe(id);
      expect(result?.mode).toBe("chat");
      expect(result?.status).toBe("creating");
    });

    it("uses default status when not provided", () => {
      const id = testSessionId();
      const now = testTimestamp();

      db.insert(schema.sessions)
        .values({
          id,
          mode: "code",
          createdAt: now,
          lastActivityAt: now,
        })
        .run();

      const result = db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();

      expect(result?.status).toBe("creating");
    });
  });

  describe("events table", () => {
    it("creates events linked to session", () => {
      const sessionId = testSessionId();
      const now = testTimestamp();

      db.insert(schema.sessions)
        .values({
          id: sessionId,
          mode: "chat",
          createdAt: now,
          lastActivityAt: now,
        })
        .run();

      db.insert(schema.events)
        .values({
          sessionId,
          seq: 1,
          type: "message",
          payload: JSON.stringify({ content: "hello" }),
          createdAt: now,
        })
        .run();

      const result = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.sessionId, sessionId))
        .get();

      expect(result).toBeDefined();
      expect(result?.seq).toBe(1);
      expect(result?.type).toBe("message");
    });

    it("cascades delete from session to events", () => {
      const sessionId = testSessionId();
      const now = testTimestamp();

      db.insert(schema.sessions)
        .values({
          id: sessionId,
          mode: "chat",
          createdAt: now,
          lastActivityAt: now,
        })
        .run();

      db.insert(schema.events)
        .values({
          sessionId,
          seq: 1,
          type: "message",
          payload: JSON.stringify({ content: "hello" }),
          createdAt: now,
        })
        .run();

      // Verify event exists
      let events = db
        .select()
        .from(schema.events)
        .where(eq(schema.events.sessionId, sessionId))
        .all();
      expect(events).toHaveLength(1);

      // Delete session
      db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();

      // Verify events are deleted
      events = db.select().from(schema.events).where(eq(schema.events.sessionId, sessionId)).all();
      expect(events).toHaveLength(0);
    });

    it("enforces unique session+seq constraint", () => {
      const sessionId = testSessionId();
      const now = testTimestamp();

      db.insert(schema.sessions)
        .values({
          id: sessionId,
          mode: "chat",
          createdAt: now,
          lastActivityAt: now,
        })
        .run();

      db.insert(schema.events)
        .values({
          sessionId,
          seq: 1,
          type: "message",
          payload: "{}",
          createdAt: now,
        })
        .run();

      // Duplicate seq should fail
      expect(() => {
        db.insert(schema.events)
          .values({
            sessionId,
            seq: 1,
            type: "message",
            payload: "{}",
            createdAt: now,
          })
          .run();
      }).toThrow();
    });
  });

  describe("repos table", () => {
    it("creates and retrieves a repo", () => {
      const id = "owner/repo";
      const now = testTimestamp();

      db.insert(schema.repos)
        .values({
          id,
          name: "repo",
          fullName: "owner/repo",
          owner: "owner",
          isPrivate: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = db.select().from(schema.repos).where(eq(schema.repos.id, id)).get();

      expect(result).toBeDefined();
      expect(result?.fullName).toBe("owner/repo");
      expect(result?.isPrivate).toBe(false);
    });
  });

  describe("settings table", () => {
    it("creates and retrieves a setting", () => {
      const now = testTimestamp();

      db.insert(schema.settings)
        .values({
          key: "github_token",
          value: JSON.stringify("ghp_xxx"),
          updatedAt: now,
        })
        .run();

      const result = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "github_token"))
        .get();

      expect(result).toBeDefined();
      expect(JSON.parse(result!.value)).toBe("ghp_xxx");
    });

    it("updates existing setting", () => {
      const now = testTimestamp();

      db.insert(schema.settings)
        .values({
          key: "default_model",
          value: JSON.stringify("gpt-4"),
          updatedAt: now,
        })
        .run();

      const later = new Date(Date.now() + 1000).toISOString();
      db.update(schema.settings)
        .set({ value: JSON.stringify("claude-3"), updatedAt: later })
        .where(eq(schema.settings.key, "default_model"))
        .run();

      const result = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "default_model"))
        .get();

      expect(JSON.parse(result!.value)).toBe("claude-3");
      expect(result?.updatedAt).toBe(later);
    });
  });
});
