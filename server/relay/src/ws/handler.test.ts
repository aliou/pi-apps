import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { SandboxManager } from "../sandbox/manager";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";
import type { WebSocketHandlerDeps } from "./handler";

describe("WebSocket Handler", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let deps: WebSocketHandlerDeps;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    const secretsService = createTestSecretsService(db);
    deps = {
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      sandboxManager: new SandboxManager(
        {
          docker: {
            sessionDataDir: "/tmp/pi-test-sessions",
            secretsBaseDir: "/tmp/pi-test-secrets",
          },
          gondolin: {
            sessionDataDir: "/tmp/pi-test-sessions",
          },
        },
        secretsService,
      ),
      environmentService: new EnvironmentService(db),
      secretsService,
      sessionHubManager: createTestSessionHubManager(db),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("WebSocketHandlerDeps", () => {
    it("has all required services", () => {
      expect(deps.sessionService).toBeDefined();
      expect(deps.eventJournal).toBeDefined();
      expect(deps.sandboxManager).toBeDefined();
      expect(deps.environmentService).toBeDefined();
      expect(deps.secretsService).toBeDefined();
      expect(deps.sessionHubManager).toBeDefined();
    });
  });

  describe("buildEventHooks", () => {
    let sessionService: SessionService;
    let hooks: ReturnType<typeof import("./hooks").buildEventHooks>;

    beforeEach(async () => {
      sessionService = deps.sessionService;
      const { buildEventHooks } = await import("./hooks");
      hooks = buildEventHooks(sessionService);
    });

    it("response event with get_state and sessionName updates session name in DB", () => {
      const session = sessionService.create({ mode: "chat" });
      expect(session.name).toBeNull();

      hooks.handle(session.id, "response", {
        type: "response",
        command: "get_state",
        success: true,
        data: { sessionName: "My Session" },
      });

      const updated = sessionService.get(session.id);
      expect(updated?.name).toBe("My Session");
    });

    it("response event with get_state but no sessionName does NOT update", () => {
      const session = sessionService.create({ mode: "chat" });
      expect(session.name).toBeNull();

      hooks.handle(session.id, "response", {
        type: "response",
        command: "get_state",
        success: true,
        data: { someOtherField: "value" },
      });

      const updated = sessionService.get(session.id);
      expect(updated?.name).toBeNull();
    });

    it("extension_ui_request with method=setTitle updates session name", () => {
      const session = sessionService.create({ mode: "chat" });
      expect(session.name).toBeNull();

      hooks.handle(session.id, "extension_ui_request", {
        type: "extension_ui_request",
        id: "some-id",
        method: "setTitle",
        title: "New Title",
      });

      const updated = sessionService.get(session.id);
      expect(updated?.name).toBe("New Title");
    });

    it("prompt stores firstUserMessage on first call only (second prompt doesn't overwrite)", () => {
      const session = sessionService.create({ mode: "chat" });
      expect(session.firstUserMessage).toBeNull();

      // First prompt
      hooks.handle(session.id, "prompt", {
        type: "prompt",
        message: "Hello, can you help?",
      });

      let updated = sessionService.get(session.id);
      expect(updated?.firstUserMessage).toBe("Hello, can you help?");

      // Second prompt - should NOT overwrite
      hooks.handle(session.id, "prompt", {
        type: "prompt",
        message: "Another message",
      });

      updated = sessionService.get(session.id);
      expect(updated?.firstUserMessage).toBe("Hello, can you help?");
    });
  });
});
