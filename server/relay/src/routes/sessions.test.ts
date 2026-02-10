import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { SandboxLogStore } from "../sandbox/log-store";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { GitHubService } from "../services/github.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
} from "../test-helpers";

describe("Sessions Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    const environmentService = new EnvironmentService(db);
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService(),
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
      environmentService,
      sandboxLogStore: new SandboxLogStore(),
      sessionDataDir: "/tmp/test-session-data",
    };

    // All session creation requires a default environment
    environmentService.create({
      name: "Test Default",
      sandboxType: "docker",
      config: { image: "pi-sandbox:test" },
      isDefault: true,
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("GET /api/sessions", () => {
    it("returns empty array when no sessions", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([]);
      expect(json.error).toBeNull();
    });

    it("returns list of sessions", async () => {
      services.sessionService.create({ mode: "chat" });
      services.sessionService.create({ mode: "code", repoId: "owner/repo" });

      const app = createApp({ services });
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.error).toBeNull();
    });

    it("includes archived sessions by default", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.sessionService.update(session.id, { status: "archived" });

      const app = createApp({ services });
      const res = await app.request("/api/sessions");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });

    it("filters by status query param", async () => {
      services.sessionService.create({ mode: "chat" });
      const archived = services.sessionService.create({ mode: "chat" });
      services.sessionService.update(archived.id, { status: "archived" });

      const app = createApp({ services });
      const res = await app.request(
        "/api/sessions?status=creating,active,idle",
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("returns session by ID", async () => {
      const session = services.sessionService.create({ mode: "chat" });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(session.id);
      expect(json.data.mode).toBe("chat");
      expect(json.error).toBeNull();
    });

    it("returns 404 for nonexistent session", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions/nonexistent-id");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.data).toBeNull();
      expect(json.error).toBe("Session not found");
    });
  });

  describe("POST /api/sessions", () => {
    it("creates chat session", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.mode).toBe("chat");
      expect(json.data.status).toBe("creating");
      expect(json.data.wsEndpoint).toContain("/ws/sessions/");
      expect(json.error).toBeNull();
    });

    it("creates code session with repoId and default environment", async () => {
      // Code sessions require an environment - create a default one
      services.environmentService.create({
        name: "Default",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: true,
      });

      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "code", repoId: "owner/repo" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.mode).toBe("code");
      expect(json.data.repoId).toBe("owner/repo");
      expect(json.data.environmentId).toBeDefined();
    });

    it("rejects session with nonexistent environmentId", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "code",
          repoId: "owner/repo",
          environmentId: "nonexistent",
        }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Environment not found");
    });

    it("rejects code session without repoId", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "code" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("repoId is required for code mode");
    });

    it("rejects invalid mode", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "invalid" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("mode must be 'chat' or 'code'");
    });

    it("rejects invalid JSON", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid JSON body");
    });
  });

  describe("POST /api/sessions/:id/activate", () => {
    it("activates session with provisioned sandbox", async () => {
      const app = createApp({ services });

      // Create session via API so sandbox gets provisioned async
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });
      const createJson = (await createRes.json()) as { data: { id: string } };
      const sessionId = createJson.data.id;

      // Wait for sandbox provisioning
      await new Promise((resolve) => setTimeout(resolve, 200));

      const res = await app.request(`/api/sessions/${sessionId}/activate`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.sessionId).toBe(sessionId);
      expect(json.data.status).toBe("active");
      expect(json.data.lastSeq).toBe(0);
      expect(json.data.sandboxStatus).toBe("running");
      expect(json.data.wsEndpoint).toContain("/ws/sessions/");
      expect(json.error).toBeNull();
    });

    it("returns 404 for nonexistent session", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions/nonexistent-id/activate", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("Session not found");
    });

    it("returns 410 for archived session", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.sessionService.update(session.id, { status: "archived" });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}/activate`, {
        method: "POST",
      });

      expect(res.status).toBe(410);
      const json = await res.json();
      expect(json.error).toBe("Session has been archived");
    });

    it("returns 409 for errored session", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.sessionService.update(session.id, { status: "error" });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}/activate`, {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("Session is in error state");
    });
  });

  describe("GET /api/sessions/:id/events", () => {
    it("returns empty events for new session", async () => {
      const session = services.sessionService.create({ mode: "chat" });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}/events`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.events).toEqual([]);
      expect(json.data.lastSeq).toBe(0);
    });

    it("returns events for session with history", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.eventJournal.append(session.id, "agent_start", {
        type: "agent_start",
      });
      services.eventJournal.append(session.id, "message_start", {
        type: "message_start",
        message: {},
      });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}/events`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.events).toHaveLength(2);
      expect(json.data.events[0].type).toBe("agent_start");
      expect(json.data.events[1].type).toBe("message_start");
      expect(json.data.lastSeq).toBe(2);
    });

    it("respects afterSeq parameter", async () => {
      const session = services.sessionService.create({ mode: "chat" });
      services.eventJournal.append(session.id, "event1", { type: "event1" });
      services.eventJournal.append(session.id, "event2", { type: "event2" });
      services.eventJournal.append(session.id, "event3", { type: "event3" });

      const app = createApp({ services });
      const res = await app.request(
        `/api/sessions/${session.id}/events?afterSeq=1`,
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.events).toHaveLength(2);
      expect(json.data.events[0].type).toBe("event2");
    });

    it("returns 404 for nonexistent session", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions/nonexistent-id/events");

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/sessions/:id", () => {
    it("deletes session", async () => {
      const session = services.sessionService.create({ mode: "chat" });

      const app = createApp({ services });
      const res = await app.request(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ok).toBe(true);

      // Verify deleted
      const deleted = services.sessionService.get(session.id);
      expect(deleted).toBeUndefined();
    });

    it("returns 404 for nonexistent session", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/sessions/nonexistent-id", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });
  });
});
