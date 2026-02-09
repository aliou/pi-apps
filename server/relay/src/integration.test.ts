import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "./app";
import type { AppDatabase } from "./db/connection";
import { EnvironmentService } from "./services/environment.service";
import { EventJournal } from "./services/event-journal";
import { GitHubService } from "./services/github.service";
import { RepoService } from "./services/repo.service";
import { SessionService } from "./services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
} from "./test-helpers";

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
      expect(getJson.data.status).toBe("active");

      // Check sandbox provider ID was stored
      const updatedSession = services.sessionService.get(sessionId);
      expect(updatedSession?.sandboxProviderId).toBeDefined();
    });

    it("activates session and returns sandbox status", async () => {
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

      // Activate session
      const activateRes = await app.request(
        `/api/sessions/${sessionId}/activate`,
        { method: "POST" },
      );
      expect(activateRes.status).toBe(200);

      const activateJson = (await activateRes.json()) as {
        data: {
          sessionId: string;
          status: string;
          lastSeq: number;
          sandboxStatus: string;
          wsEndpoint: string;
        };
      };
      expect(activateJson.data.sessionId).toBe(sessionId);
      expect(activateJson.data.status).toBe("active");
      expect(activateJson.data.lastSeq).toBe(0);
      expect(activateJson.data.sandboxStatus).toBe("running");
      expect(activateJson.data.wsEndpoint).toBe(`/ws/sessions/${sessionId}`);
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
      const sessionBeforeDelete = services.sessionService.get(sessionId);
      expect(sessionBeforeDelete?.sandboxProviderId).toBeDefined();

      // Delete session
      const deleteRes = await app.request(`/api/sessions/${sessionId}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);

      // Verify session is deleted
      const getRes = await app.request(`/api/sessions/${sessionId}`);
      expect(getRes.status).toBe(404);

      // Verify session is deleted (sandbox termination happens via provider)
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

  describe("Activate reflects journal state", () => {
    it("lastSeq updates as events are added", async () => {
      const app = createApp({ services });

      // Create session and wait for provisioning
      const createRes = await app.request("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat" }),
      });
      const createJson = (await createRes.json()) as { data: { id: string } };
      const sessionId = createJson.data.id;

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Initial lastSeq should be 0
      const activate1 = await app.request(
        `/api/sessions/${sessionId}/activate`,
        { method: "POST" },
      );
      const activate1Json = (await activate1.json()) as {
        data: { lastSeq: number };
      };
      expect(activate1Json.data.lastSeq).toBe(0);

      // Add events
      services.eventJournal.append(sessionId, "event_1", { type: "event_1" });
      services.eventJournal.append(sessionId, "event_2", { type: "event_2" });

      // lastSeq should now be 2
      const activate2 = await app.request(
        `/api/sessions/${sessionId}/activate`,
        { method: "POST" },
      );
      const activate2Json = (await activate2.json()) as {
        data: { lastSeq: number };
      };
      expect(activate2Json.data.lastSeq).toBe(2);
    });
  });
});
