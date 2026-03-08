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

describe("Environments Routes", () => {
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

  it("rejects invalid env var names", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bad Env",
        sandboxType: "docker",
        config: {
          image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest",
          envVars: [{ key: "not-valid", value: "x" }],
        },
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid env var key");
  });

  it("rejects duplicate env var keys", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dup Env",
        sandboxType: "docker",
        config: {
          image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest",
          envVars: [
            { key: "FOO", value: "1" },
            { key: "FOO", value: "2" },
          ],
        },
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Duplicate env var key");
  });

  it("persists non-secret env vars on create", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Good Env",
        sandboxType: "docker",
        config: {
          image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest",
          envVars: [{ key: "FOO_BAR", value: "baz" }],
        },
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.config.envVars).toEqual([
      { key: "FOO_BAR", value: "baz" },
    ]);
  });
});
