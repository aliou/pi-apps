import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { SandboxManager } from "../sandbox/manager";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { SessionService } from "../services/session.service";
import { createTestDatabase } from "../test-helpers";
import { ConnectionManager, type WebSocketConnection } from "./connection";
import type { WebSocketHandlerDeps } from "./handler";

describe("WebSocket Handler", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let deps: WebSocketHandlerDeps;
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    deps = {
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      sandboxManager: new SandboxManager({
        docker: {
          sessionDataDir: "/tmp/pi-test-sessions",
          secretsBaseDir: "/tmp/pi-test-secrets",
        },
        getCfApiToken: async () => null,
      }),
      environmentService: new EnvironmentService(db),
    };
    connectionManager = new ConnectionManager();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("ConnectionManager", () => {
    it("tracks connections per session", () => {
      const sessionId = "test-session";
      expect(connectionManager.getConnectionCount(sessionId)).toBe(0);

      // Create a mock connection (we can't easily create real WebSocketConnections in tests)
      const mockConn = {} as WebSocketConnection;
      connectionManager.add(sessionId, mockConn);

      expect(connectionManager.getConnectionCount(sessionId)).toBe(1);
      expect(connectionManager.getForSession(sessionId).has(mockConn)).toBe(
        true,
      );
    });

    it("removes connections correctly", () => {
      const sessionId = "test-session";
      const mockConn = {} as WebSocketConnection;

      connectionManager.add(sessionId, mockConn);
      expect(connectionManager.getConnectionCount(sessionId)).toBe(1);

      connectionManager.remove(sessionId, mockConn);
      expect(connectionManager.getConnectionCount(sessionId)).toBe(0);
    });

    it("supports multiple connections per session", () => {
      const sessionId = "test-session";
      const mockConn1 = {} as WebSocketConnection;
      const mockConn2 = {} as WebSocketConnection;

      connectionManager.add(sessionId, mockConn1);
      connectionManager.add(sessionId, mockConn2);

      expect(connectionManager.getConnectionCount(sessionId)).toBe(2);

      connectionManager.remove(sessionId, mockConn1);
      expect(connectionManager.getConnectionCount(sessionId)).toBe(1);
    });

    it("returns empty set for unknown session", () => {
      const connections = connectionManager.getForSession("unknown");
      expect(connections.size).toBe(0);
    });
  });

  describe("WebSocketHandlerDeps", () => {
    it("has all required services", () => {
      expect(deps.sessionService).toBeDefined();
      expect(deps.eventJournal).toBeDefined();
      expect(deps.sandboxManager).toBeDefined();
      expect(deps.environmentService).toBeDefined();
    });
  });
});
