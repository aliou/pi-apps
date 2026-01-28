import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { events } from "../db/schema";
import { createTestDatabase } from "../test-helpers";
import { EventJournal } from "./event-journal";
import { SessionService } from "./session.service";

describe("EventJournal", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let journal: EventJournal;
  let sessionService: SessionService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    journal = new EventJournal(db);
    sessionService = new SessionService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  function createSession() {
    return sessionService.create({ mode: "chat" });
  }

  describe("append", () => {
    it("assigns seq = 1 for first event", () => {
      const session = createSession();
      const seq = journal.append(session.id, "message", { content: "hello" });
      expect(seq).toBe(1);
    });

    it("assigns monotonic seq numbers", () => {
      const session = createSession();

      const seq1 = journal.append(session.id, "message", { content: "one" });
      const seq2 = journal.append(session.id, "message", { content: "two" });
      const seq3 = journal.append(session.id, "message", { content: "three" });

      expect(seq1).toBe(1);
      expect(seq2).toBe(2);
      expect(seq3).toBe(3);
    });

    it("uses independent seq per session", () => {
      const session1 = createSession();
      const session2 = createSession();

      journal.append(session1.id, "message", { content: "s1-1" });
      journal.append(session1.id, "message", { content: "s1-2" });

      // Session 2 should start at seq 1
      const seq = journal.append(session2.id, "message", { content: "s2-1" });
      expect(seq).toBe(1);
    });

    it("stores payload as JSON", () => {
      const session = createSession();
      journal.append(session.id, "message", { content: "hello", nested: { foo: 123 } });

      const entries = journal.getRecent(session.id, 1);
      expect(entries).toHaveLength(1);

      const payload = JSON.parse(entries[0]!.payload);
      expect(payload.content).toBe("hello");
      expect(payload.nested.foo).toBe(123);
    });
  });

  describe("getAfterSeq", () => {
    it("returns events after given seq", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });
      journal.append(session.id, "msg", { n: 3 });
      journal.append(session.id, "msg", { n: 4 });

      const entries = journal.getAfterSeq(session.id, 2);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.seq).toBe(3);
      expect(entries[1]?.seq).toBe(4);
    });

    it("returns empty array when no events after seq", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });

      const entries = journal.getAfterSeq(session.id, 1);
      expect(entries).toHaveLength(0);
    });

    it("respects limit parameter", () => {
      const session = createSession();
      for (let i = 1; i <= 10; i++) {
        journal.append(session.id, "msg", { n: i });
      }

      const entries = journal.getAfterSeq(session.id, 0, 3);
      expect(entries).toHaveLength(3);
      expect(entries[0]?.seq).toBe(1);
      expect(entries[2]?.seq).toBe(3);
    });

    it("returns in ascending order", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });
      journal.append(session.id, "msg", { n: 3 });

      const entries = journal.getAfterSeq(session.id, 0);
      expect(entries[0]?.seq).toBe(1);
      expect(entries[1]?.seq).toBe(2);
      expect(entries[2]?.seq).toBe(3);
    });
  });

  describe("getRecent", () => {
    it("returns last N events in ascending order", () => {
      const session = createSession();
      for (let i = 1; i <= 5; i++) {
        journal.append(session.id, "msg", { n: i });
      }

      const entries = journal.getRecent(session.id, 3);
      expect(entries).toHaveLength(3);
      // Should be in ascending order (3, 4, 5)
      expect(entries[0]?.seq).toBe(3);
      expect(entries[1]?.seq).toBe(4);
      expect(entries[2]?.seq).toBe(5);
    });

    it("returns all events if fewer than limit", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });

      const entries = journal.getRecent(session.id, 10);
      expect(entries).toHaveLength(2);
    });
  });

  describe("getMaxSeq", () => {
    it("returns 0 for session with no events", () => {
      const session = createSession();
      expect(journal.getMaxSeq(session.id)).toBe(0);
    });

    it("returns highest seq", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });
      journal.append(session.id, "msg", { n: 3 });

      expect(journal.getMaxSeq(session.id)).toBe(3);
    });
  });

  describe("deleteForSession", () => {
    it("removes all events for session", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });

      journal.deleteForSession(session.id);

      expect(journal.getMaxSeq(session.id)).toBe(0);
      expect(journal.getRecent(session.id, 10)).toHaveLength(0);
    });

    it("does not affect other sessions", () => {
      const session1 = createSession();
      const session2 = createSession();

      journal.append(session1.id, "msg", { n: 1 });
      journal.append(session2.id, "msg", { n: 1 });

      journal.deleteForSession(session1.id);

      expect(journal.getMaxSeq(session1.id)).toBe(0);
      expect(journal.getMaxSeq(session2.id)).toBe(1);
    });
  });

  describe("pruneOlderThan", () => {
    it("only prunes stopped/deleted sessions", () => {
      const activeSession = createSession();
      const stoppedSession = createSession();

      // Mark one as stopped
      sessionService.update(stoppedSession.id, { status: "stopped" });

      // Add old events (use a timestamp in the past)
      const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(); // 10 days ago

      // We need to insert directly to set createdAt
      db.insert(events)
        .values({
          sessionId: activeSession.id,
          seq: 1,
          type: "msg",
          payload: "{}",
          createdAt: oldDate,
        })
        .run();

      db.insert(events)
        .values({
          sessionId: stoppedSession.id,
          seq: 1,
          type: "msg",
          payload: "{}",
          createdAt: oldDate,
        })
        .run();

      const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days ago
      const deleted = journal.pruneOlderThan(cutoff);

      // Should only delete from stopped session
      expect(deleted).toBe(1);
      expect(journal.getMaxSeq(activeSession.id)).toBe(1);
      expect(journal.getMaxSeq(stoppedSession.id)).toBe(0);
    });

    it("returns 0 when no sessions to prune", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });

      const cutoff = new Date(Date.now() - 1000).toISOString();
      const deleted = journal.pruneOlderThan(cutoff);

      expect(deleted).toBe(0);
    });
  });

  describe("cascade delete", () => {
    it("deletes events when session is deleted", () => {
      const session = createSession();
      journal.append(session.id, "msg", { n: 1 });
      journal.append(session.id, "msg", { n: 2 });

      expect(journal.getMaxSeq(session.id)).toBe(2);

      // Delete session via service (which triggers cascade)
      sessionService.delete(session.id);

      expect(journal.getMaxSeq(session.id)).toBe(0);
    });
  });
});
