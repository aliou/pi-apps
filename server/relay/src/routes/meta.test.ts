import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { SandboxLogStore } from "../sandbox/log-store";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { ExtensionConfigService } from "../services/extension-config.service";
import { ExtensionManifestService } from "../services/extension-manifest.service";
import { GitHubService } from "../services/github.service";
import { PackageCatalogService } from "../services/package-catalog.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestGitHubAppService,
  createTestSandboxManager,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";

describe("Meta Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    const secretsService = createTestSecretsService(db);
    const githubAppService = createTestGitHubAppService(db, secretsService);
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService({ githubAppService }),
      githubAppService,
      sandboxManager: createTestSandboxManager(),
      secretsService,
      environmentService: new EnvironmentService(db),
      extensionConfigService: new ExtensionConfigService(db),
      sandboxLogStore: new SandboxLogStore(),
      sessionDataDir: "/tmp/test-session-data",
      sessionHubManager: createTestSessionHubManager(db),
      packageCatalogService: new PackageCatalogService(
        new ExtensionManifestService(),
      ),
    };
  });

  afterEach(() => {
    sqlite.close();
    delete process.env.GIT_COMMIT;
    delete process.env.DASHBOARD_GIT_COMMIT;
    delete process.env.BUILT_AT;
  });

  it("returns dev markers when hashes are missing", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/meta/version");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.relayVersion).toBe("0.1.0");
    expect(json.data.serverHash).toBe("dev");
    expect(json.data.dashboardHash).toBe("dev");
  });

  it("returns configured version metadata", async () => {
    process.env.GIT_COMMIT = "abc1234";
    process.env.DASHBOARD_GIT_COMMIT = "def5678";
    process.env.BUILT_AT = "2026-03-11T11:00:00.000Z";

    const app = createApp({ services });
    const res = await app.request("/api/meta/version");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({
      relayVersion: "0.1.0",
      serverHash: "abc1234",
      dashboardHash: "def5678",
      builtAt: "2026-03-11T11:00:00.000Z",
    });
  });
});
