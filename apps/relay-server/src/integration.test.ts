import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "./app";
import type { AppDatabase } from "./db/connection";
import { SandboxManager } from "./sandbox/manager";
import { EventJournal } from "./services/event-journal";
import { GitHubService } from "./services/github.service";
import { RepoService } from "./services/repo.service";
import { SessionService } from "./services/session.service";
import { createTestDatabase } from "./test-helpers";

/**
 * Integration tests for the session protocol flow.
 * Tests the REST API endpoints and their interaction with sandbox/journal.
 */
describe("Session Protocol Integration", () => {
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
      sandboxManager: new SandboxManager({ provider: "mock" }),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Session lifecycle", () => {
    it("creates session and provisions sandbox", async () => {
      const app = createApp({ services });

      // Create session
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });

      expect(createRes.status).toBe(200);
      const createJson = (await createRes.json()) as {
        data: { id: string; status: string; wsEndpoint: string };
      };
      const sessionId = createJson.data.id;

      expect(createJson.data.status).toBe("creating");
      expect(createJson.data.wsEndpoint).toBe(`/ws/sessions/${sessionId}`);

      // Wait for sandbox to provision
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check session status via GET
      const getRes = await app.request(`/api/sessions/${sessionId}`);
      expect(getRes.status).toBe(200);
      const getJson = (await getRes.json()) as { data: { status: string } };
      expect(getJson.data.status).toBe("ready");

      // Check sandbox is available
      const sandbox = services.sandboxManager.getForSession(sessionId);
      expect(sandbox).toBeDefined();
      expect(sandbox?.status).toBe("running");
    });

    it("provides connection info via /connect endpoint", async () => {
      const app = createApp({ services });

      // Create session and wait for ready
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });
      const createJson = (await createRes.json()) as { data: { id: string } };
      const sessionId = createJson.data.id;

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Get connection info
      const connectRes = await app.request(
        `/api/sessions/${sessionId}/connect`,
      );
      expect(connectRes.status).toBe(200);

      const connectJson = (await connectRes.json()) as {
        data: {
          sessionId: string;
          status: string;
          lastSeq: number;
          sandboxReady: boolean;
          wsEndpoint: string;
        };
      };
      expect(connectJson.data.sessionId).toBe(sessionId);
      expect(connectJson.data.status).toBe("ready");
      expect(connectJson.data.lastSeq).toBe(0);
      expect(connectJson.data.sandboxReady).toBe(true);
      expect(connectJson.data.wsEndpoint).toBe(`/ws/sessions/${sessionId}`);
    });

    it("deletes session and terminates sandbox", async () => {
      const app = createApp({ services });

      // Create session and wait for ready
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });
      const createJson = (await createRes.json()) as { data: { id: string } };
      const sessionId = createJson.data.id;

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify sandbox exists
      expect(services.sandboxManager.getForSession(sessionId)).toBeDefined();

      // Delete session
      const deleteRes = await app.request(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);

      // Verify session is deleted
      const getRes = await app.request(`/api/sessions/${sessionId}`);
      expect(getRes.status).toBe(404);

      // Verify sandbox is terminated
      expect(services.sandboxManager.getForSession(sessionId)).toBeUndefined();
    });
  });

  describe("Event journaling", () => {
    it("stores and retrieves events via /events endpoint", async () => {
      const app = createApp({ services });

      // Create session
      const session = services.sessionService.create({ mode: "chat" });

      // Append some events directly to journal
      services.eventJournal.append(session.id, "agent_start", {
        type: "agent_start",
      });
      services.eventJournal.append(session.id, "message_start", {
        type: "message_start",
        message: { role: "assistant", content: [] },
      });
      services.eventJournal.append(session.id, "message_update", {
        type: "message_update",
        message: { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      });

      // Fetch events
      const eventsRes = await app.request(`/api/sessions/${session.id}/events`);
      expect(eventsRes.status).toBe(200);

      const eventsJson = (await eventsRes.json()) as {
        data: {
          events: Array<{ seq: number; type: string }>;
          lastSeq: number;
        };
      };
      expect(eventsJson.data.events).toHaveLength(3);
      expect(eventsJson.data.events[0]?.type).toBe("agent_start");
      expect(eventsJson.data.events[1]?.type).toBe("message_start");
      expect(eventsJson.data.events[2]?.type).toBe("message_update");
      expect(eventsJson.data.lastSeq).toBe(3);
    });

    it("supports pagination with afterSeq", async () => {
      const app = createApp({ services });

      const session = services.sessionService.create({ mode: "chat" });

      // Add 5 events
      for (let i = 1; i <= 5; i++) {
        services.eventJournal.append(session.id, `event_${i}`, {
          type: `event_${i}`,
        });
      }

      // Fetch events after seq 2
      const eventsRes = await app.request(
        `/api/sessions/${session.id}/events?afterSeq=2`,
      );
      const eventsJson = (await eventsRes.json()) as {
        data: {
          events: Array<{ seq: number; type: string }>;
          lastSeq: number;
        };
      };

      expect(eventsJson.data.events).toHaveLength(3);
      expect(eventsJson.data.events[0]?.seq).toBe(3);
      expect(eventsJson.data.events[0]?.type).toBe("event_3");
      expect(eventsJson.data.lastSeq).toBe(5);
    });

    it("supports limit parameter", async () => {
      const app = createApp({ services });

      const session = services.sessionService.create({ mode: "chat" });

      // Add 10 events
      for (let i = 1; i <= 10; i++) {
        services.eventJournal.append(session.id, `event_${i}`, {
          type: `event_${i}`,
        });
      }

      // Fetch with limit
      const eventsRes = await app.request(
        `/api/sessions/${session.id}/events?limit=3`,
      );
      const eventsJson = (await eventsRes.json()) as {
        data: { events: Array<{ seq: number }>; lastSeq: number };
      };

      expect(eventsJson.data.events).toHaveLength(3);
      expect(eventsJson.data.lastSeq).toBe(3);
    });
  });

  describe("Connection info reflects journal state", () => {
    it("lastSeq updates as events are added", async () => {
      const app = createApp({ services });

      // Create session
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });
      const createJson = (await createRes.json()) as { data: { id: string } };
      const sessionId = createJson.data.id;

      // Initial lastSeq should be 0
      const connect1 = await app.request(`/api/sessions/${sessionId}/connect`);
      const connect1Json = (await connect1.json()) as {
        data: { lastSeq: number };
      };
      expect(connect1Json.data.lastSeq).toBe(0);

      // Add events
      services.eventJournal.append(sessionId, "event_1", { type: "event_1" });
      services.eventJournal.append(sessionId, "event_2", { type: "event_2" });

      // lastSeq should now be 2
      const connect2 = await app.request(`/api/sessions/${sessionId}/connect`);
      const connect2Json = (await connect2.json()) as {
        data: { lastSeq: number };
      };
      expect(connect2Json.data.lastSeq).toBe(2);
    });
  });
});
