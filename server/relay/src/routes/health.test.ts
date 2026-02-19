import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { SandboxLogStore } from "../sandbox/log-store";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { ExtensionConfigService } from "../services/extension-config.service";
import { GitHubService } from "../services/github.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";

describe("Health Routes", () => {
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
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
      environmentService: new EnvironmentService(db),
      extensionConfigService: new ExtensionConfigService(db),
      sandboxLogStore: new SandboxLogStore(),
      sessionDataDir: "/tmp/test-session-data",
      sessionHubManager: createTestSessionHubManager(db),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("GET /health", () => {
    it("returns ok and version", async () => {
      const app = createApp({ services });
      const res = await app.request("/health");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.version).toBe("0.1.0");
    });
  });

  describe("GET /api", () => {
    it("returns server info and endpoints", async () => {
      const app = createApp({ services });
      const res = await app.request("/api");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.name).toBe("pi-relay");
      expect(json.version).toBe("0.1.0");
      expect(json.endpoints).toBeDefined();
      expect(json.endpoints.health).toBe("GET /health");
      expect(json.endpoints.rpc).toBe("WS /rpc (not yet implemented)");
    });
  });
});
