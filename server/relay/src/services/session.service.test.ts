import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { events } from "../db/schema";
import { createTestDatabase } from "../test-helpers";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let service: SessionService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    service = new SessionService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("creates chat session with UUID and timestamps", () => {
      const session = service.create({ mode: "chat" });

      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(session.mode).toBe("chat");
      expect(session.status).toBe("creating");
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
    });

    it("creates code session with repoId", () => {
      const session = service.create({
        mode: "code",
        repoId: "owner/repo",
        repoPath: "/path/to/repo",
        branchName: "session-xyz",
      });

      expect(session.mode).toBe("code");
      expect(session.repoId).toBe("owner/repo");
      expect(session.repoPath).toBe("/path/to/repo");
      expect(session.branchName).toBe("session-xyz");
    });

    it("throws if code mode without repoId", () => {
      expect(() => {
        service.create({ mode: "code" });
      }).toThrow("repoId is required for code mode sessions");
    });

    it("stores model preferences", () => {
      const session = service.create({
        mode: "chat",
        modelProvider: "anthropic",
        modelId: "claude-3-opus",
      });

      expect(session.currentModelProvider).toBe("anthropic");
      expect(session.currentModelId).toBe("claude-3-opus");
    });

    it("stores system prompt", () => {
      const session = service.create({
        mode: "chat",
        systemPrompt: "You are a helpful assistant.",
      });

      expect(session.systemPrompt).toBe("You are a helpful assistant.");
    });
  });

  describe("get", () => {
    it("returns session by ID", () => {
      const created = service.create({ mode: "chat" });
      const fetched = service.get(created.id);

      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });

    it("returns undefined for nonexistent ID", () => {
      const result = service.get("nonexistent-id");
      expect(result).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns non-deleted sessions ordered by lastActivityAt desc", async () => {
      // Create sessions with slight delays to ensure different timestamps
      const session1 = service.create({ mode: "chat" });

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      const session2 = service.create({ mode: "chat" });

      await new Promise((r) => setTimeout(r, 10));
      const session3 = service.create({ mode: "chat" });

      // session3 should be first (most recent)
      const list = service.list();
      expect(list).toHaveLength(3);
      expect(list[0]?.id).toBe(session3.id);
      expect(list[1]?.id).toBe(session2.id);
      expect(list[2]?.id).toBe(session1.id);
    });

    it("includes archived sessions by default", () => {
      const session = service.create({ mode: "chat" });
      service.update(session.id, { status: "archived" });

      const list = service.list();
      expect(list.find((s) => s.id === session.id)).toBeDefined();
    });

    it("filters by status when specified", () => {
      const session1 = service.create({ mode: "chat" });
      const session2 = service.create({ mode: "chat" });
      service.update(session1.id, { status: "archived" });

      const active = service.list({ status: ["active", "creating"] });
      expect(active.find((s) => s.id === session1.id)).toBeUndefined();
      expect(active.find((s) => s.id === session2.id)).toBeDefined();
    });
  });

  describe("update", () => {
    it("updates status", () => {
      const session = service.create({ mode: "chat" });
      service.update(session.id, { status: "active" });

      const updated = service.get(session.id);
      expect(updated?.status).toBe("active");
    });

    it("updates name", () => {
      const session = service.create({ mode: "chat" });
      service.update(session.id, { name: "My Session" });

      const updated = service.get(session.id);
      expect(updated?.name).toBe("My Session");
    });

    it("updates model preferences", () => {
      const session = service.create({ mode: "chat" });
      service.update(session.id, {
        currentModelProvider: "openai",
        currentModelId: "gpt-4",
      });

      const updated = service.get(session.id);
      expect(updated?.currentModelProvider).toBe("openai");
      expect(updated?.currentModelId).toBe("gpt-4");
    });

    it("bumps lastActivityAt on update", async () => {
      const session = service.create({ mode: "chat" });
      const originalActivity = session.lastActivityAt;

      await new Promise((r) => setTimeout(r, 10));
      service.update(session.id, { name: "Updated" });

      const updated = service.get(session.id);
      assert(updated, "session exists");
      expect(updated.lastActivityAt).not.toBe(originalActivity);
      expect(new Date(updated.lastActivityAt).getTime()).toBeGreaterThan(
        new Date(originalActivity).getTime(),
      );
    });

    it("throws for nonexistent session", () => {
      expect(() => {
        service.update("nonexistent", { status: "active" });
      }).toThrow("Session not found");
    });
  });

  describe("touch", () => {
    it("bumps lastActivityAt", async () => {
      const session = service.create({ mode: "chat" });
      const originalActivity = session.lastActivityAt;

      await new Promise((r) => setTimeout(r, 10));
      service.touch(session.id);

      const updated = service.get(session.id);
      assert(updated, "session exists");
      expect(new Date(updated.lastActivityAt).getTime()).toBeGreaterThan(
        new Date(originalActivity).getTime(),
      );
    });
  });

  describe("delete", () => {
    it("removes session", () => {
      const session = service.create({ mode: "chat" });
      service.delete(session.id);

      const result = service.get(session.id);
      expect(result).toBeUndefined();
    });

    it("cascades to events", () => {
      const session = service.create({ mode: "chat" });

      // Add an event
      db.insert(events)
        .values({
          sessionId: session.id,
          seq: 1,
          type: "message",
          payload: "{}",
          createdAt: new Date().toISOString(),
        })
        .run();

      // Verify event exists
      let allEvents = db.select().from(events).all();
      expect(allEvents).toHaveLength(1);

      // Delete session
      service.delete(session.id);

      // Verify events are gone
      allEvents = db.select().from(events).all();
      expect(allEvents).toHaveLength(0);
    });
  });
});
