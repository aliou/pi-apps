import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { EventJournal } from "../services/event-journal";
import { GitHubService } from "../services/github.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import { createTestDatabase } from "../test-helpers";

describe("Sessions Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService(),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("GET /api/sessions", () => {
    it("returns empty array when no sessions", async () => {
      const app = createApp(services);
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([]);
      expect(json.error).toBeNull();
    });

    it("returns list of sessions", async () => {
      services.sessionService.create({ mode: "chat" });
      services.sessionService.create({ mode: "code", repoId: "owner/repo" });

      const app = createApp(services);
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.error).toBeNull();
    });

    it("excludes deleted sessions", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.sessionService.update(session.id, { status: "deleted" });

      const app = createApp(services);
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(0);
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns session by ID", async () => {
      const session = services.sessionService.create({ mode: "chat" });

      const app = createApp(services);
      const res = await app.request(`/api/sessions/${session.id}`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(session.id);
      expect(json.data.mode).toBe("chat");
      expect(json.error).toBeNull();
    });

    it("returns 404 for nonexistent session", async () => {
      const app = createApp(services);
      const res = await app.request("/api/sessions/nonexistent-id");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.data).toBeNull();
      expect(json.error).toBe("Session not found");
    });
  });
});
