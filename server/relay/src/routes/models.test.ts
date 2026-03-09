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
  createTestSandboxManager,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";

describe("Models Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;
  let environmentService: EnvironmentService;
  let extensionConfigService: ExtensionConfigService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    environmentService = new EnvironmentService(db);
    extensionConfigService = new ExtensionConfigService(db);
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService(),
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
      environmentService,
      extensionConfigService,
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
  });

  it("returns fallback-static when no gondolin environment exists", async () => {
    const app = createApp({ services });
    const res = await app.request("/api/models");
    const json = (await res.json()) as {
      data: { models: Array<{ id: string; provider: string }>; source: string };
      error: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.error).toBeNull();
    expect(json.data.source).toBe("fallback-static");
    expect(json.data.models.length).toBeGreaterThan(0);
    expect(json.data.models[0]).toHaveProperty("id");
  });

  it("returns fallback-cache when gondolin becomes unavailable after a successful introspection", async () => {
    const gondolinEnv = environmentService.create({
      name: "Gondolin",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    services.sandboxManager.createForSession = async () => {
      const messageHandlers = new Set<(message: string) => void>();
      const closeHandlers = new Set<(reason?: string) => void>();
      return {
        sessionId: "introspect-models-test",
        providerId: "fake-introspect",
        status: "running",
        resume: async () => {},
        exec: async () => ({ exitCode: 0, output: "pi 0.0.0" }),
        attach: async () => ({
          send: (message: string) => {
            const payload = JSON.parse(message) as { id: string; type: string };
            const response = JSON.stringify({
              type: "response",
              command: "get_available_models",
              id: payload.id,
              success: true,
              data: {
                models: [
                  {
                    provider: "anthropic",
                    modelId: "claude-sonnet-4-20250514",
                  },
                ],
              },
            });
            for (const handler of messageHandlers) {
              handler(response);
            }
          },
          onMessage: (handler: (message: string) => void) => {
            messageHandlers.add(handler);
            queueMicrotask(() => handler('{"type":"ready"}'));
            return () => messageHandlers.delete(handler);
          },
          onClose: (handler: (reason?: string) => void) => {
            closeHandlers.add(handler);
            return () => closeHandlers.delete(handler);
          },
          close: () => {
            for (const handler of closeHandlers) {
              handler("detached");
            }
          },
        }),
        pause: async () => {},
        terminate: async () => {},
        onStatusChange: () => () => {},
      };
    };

    const app = createApp({ services });

    const first = await app.request("/api/models");
    const firstJson = (await first.json()) as {
      data: { source: string; models: Array<{ id: string }> };
      error: string | null;
    };
    expect(firstJson.data.source).toBe("introspected");
    expect(firstJson.error).toBeNull();

    environmentService.delete(gondolinEnv.id);
    extensionConfigService.add({
      scope: "global",
      package: "npm:@test/new-provider@1.0.0",
    });

    const second = await app.request("/api/models");
    const secondJson = (await second.json()) as {
      data: {
        source: string;
        degraded?: boolean;
        models: Array<{ id: string }>;
      };
      error: string | null;
    };

    expect(second.status).toBe(200);
    expect(secondJson.data.source).toBe("fallback-cache");
    expect(secondJson.data.degraded).toBe(true);
    expect(secondJson.data.models.length).toBeGreaterThan(0);
  });
});
