import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { settings } from "../db/schema";
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

function makeIntrospectionSandbox(
  models: Array<{ provider: string; id: string }>,
) {
  const messageHandlers = new Set<(message: string) => void>();
  const closeHandlers = new Set<(reason?: string) => void>();

  return {
    sessionId: "introspect-models-test",
    providerId: "fake-introspect",
    status: "running" as const,
    resume: async () => {},
    exec: async () => ({ exitCode: 0, output: "pi 0.0.0" }),
    attach: async () => ({
      send: (message: string) => {
        const payload = JSON.parse(message) as { id: string };
        const response = JSON.stringify({
          type: "response",
          command: "get_available_models",
          id: payload.id,
          success: true,
          data: { models },
        });
        for (const handler of messageHandlers) {
          handler(response);
        }
      },
      onMessage: (handler: (message: string) => void) => {
        messageHandlers.add(handler);
        queueMicrotask(() => handler('{"type":"ready"}'));
        return () => {
          messageHandlers.delete(handler);
        };
      },
      onClose: (handler: (reason?: string) => void) => {
        closeHandlers.add(handler);
        return () => {
          closeHandlers.delete(handler);
        };
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
}

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

  it("returns source configured-environment when configured environment succeeds", async () => {
    const configuredEnv = environmentService.create({
      name: "Configured",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    db.insert(settings)
      .values({
        key: "models_introspection",
        value: JSON.stringify({ environmentId: configuredEnv.id }),
        updatedAt: new Date().toISOString(),
      })
      .run();

    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () =>
      makeIntrospectionSandbox([
        { provider: "anthropic", id: "claude-sonnet-4-20250514" },
      ]);

    const app = createApp({ services });
    const res = await app.request("/api/models");
    const json = (await res.json()) as {
      data: {
        source: string;
        environmentId?: string;
        models: Array<{ id: string }>;
      };
      error: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.error).toBeNull();
    expect(json.data.source).toBe("configured-environment");
    expect(json.data.environmentId).toBe(configuredEnv.id);
    expect(json.data.models.length).toBe(1);
  });

  it("falls back to fallback-environment when configured environment fails", async () => {
    const configuredEnv = environmentService.create({
      name: "Configured Docker",
      sandboxType: "docker",
      config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest" },
      isDefault: false,
    });
    const defaultEnv = environmentService.create({
      name: "Default Gondolin",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    db.insert(settings)
      .values({
        key: "models_introspection",
        value: JSON.stringify({ environmentId: configuredEnv.id }),
        updatedAt: new Date().toISOString(),
      })
      .run();

    let attempts = 0;
    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          ...makeIntrospectionSandbox([]),
          exec: async () => ({ exitCode: 1, output: "pi missing" }),
        };
      }
      return makeIntrospectionSandbox([
        { provider: "openai", id: "gpt-4o" },
      ]);
    };

    const app = createApp({ services });
    const res = await app.request("/api/models");
    const json = (await res.json()) as {
      data: { source: string; environmentId?: string };
      error: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.data.source).toBe("fallback-environment");
    expect(json.data.environmentId).toBe(defaultEnv.id);
    expect(attempts).toBe(2);
  });

  it("returns unavailable when all introspection paths fail and no cache exists", async () => {
    environmentService.create({
      name: "Docker",
      sandboxType: "docker",
      config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest" },
      isDefault: true,
    });

    services.sandboxManager.isProviderAvailable = async () => false;

    const app = createApp({ services });
    const res = await app.request("/api/models");
    const json = (await res.json()) as {
      data: {
        source: string;
        degraded?: boolean;
        models: Array<{ id: string }>;
      };
      error: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.data.source).toBe("unavailable");
    expect(json.data.degraded).toBe(true);
    expect(json.data.models).toHaveLength(0);
  });

  it("returns fallback-cache when fresh introspection fails after previous success", async () => {
    environmentService.create({
      name: "Gondolin",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () =>
      makeIntrospectionSandbox([
        { provider: "anthropic", id: "claude-sonnet-4-20250514" },
      ]);

    const app = createApp({ services });

    const first = await app.request("/api/models");
    const firstJson = (await first.json()) as {
      data: { source: string; models: Array<{ id: string }> };
      error: string | null;
    };
    expect(firstJson.data.source).toBe("fallback-environment");

    extensionConfigService.add({
      scope: "global",
      package: "npm:@test/new-provider@1.0.0",
    });

    services.sandboxManager.isProviderAvailable = async () => false;

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

  it("returns cached fingerprint hit without re-introspection", async () => {
    environmentService.create({
      name: "Gondolin",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    let attempts = 0;
    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () => {
      attempts += 1;
      return makeIntrospectionSandbox([
        { provider: "openai", id: "gpt-4o" },
      ]);
    };

    const app = createApp({ services });

    const first = await app.request("/api/models");
    const firstJson = (await first.json()) as {
      data: { source: string };
      error: string | null;
    };
    expect(firstJson.data.source).toBe("fallback-environment");

    const second = await app.request("/api/models");
    const secondJson = (await second.json()) as {
      data: { source: string };
      error: string | null;
    };

    expect(secondJson.data.source).toBe("fallback-environment");
    expect(attempts).toBe(1);
  });

  it("ignores missing configured environment and continues fallback order", async () => {
    const defaultEnv = environmentService.create({
      name: "Default",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    db.insert(settings)
      .values({
        key: "models_introspection",
        value: JSON.stringify({ environmentId: "missing-env" }),
        updatedAt: new Date().toISOString(),
      })
      .run();

    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () =>
      makeIntrospectionSandbox([{ provider: "openai", id: "gpt-4o" }]);

    const app = createApp({ services });
    const res = await app.request("/api/models");
    const json = (await res.json()) as {
      data: { source: string; environmentId?: string };
      error: string | null;
    };

    expect(res.status).toBe(200);
    expect(json.data.source).toBe("fallback-environment");
    expect(json.data.environmentId).toBe(defaultEnv.id);
  });

  it("clears models cache via refresh endpoint", async () => {
    environmentService.create({
      name: "Gondolin",
      sandboxType: "gondolin",
      config: {},
      isDefault: true,
    });

    let attempts = 0;
    services.sandboxManager.isProviderAvailable = async () => true;
    services.sandboxManager.createForSession = async () => {
      attempts += 1;
      return makeIntrospectionSandbox([
        { provider: "openai", id: `gpt-4o-${attempts}` },
      ]);
    };

    const app = createApp({ services });

    const first = await app.request("/api/models");
    const firstJson = (await first.json()) as {
      data: { models: Array<{ id: string }> };
      error: string | null;
    };
    expect(firstJson.data.models[0]?.id).toBe("gpt-4o-1");

    const second = await app.request("/api/models");
    const secondJson = (await second.json()) as {
      data: { models: Array<{ id: string }> };
      error: string | null;
    };
    expect(secondJson.data.models[0]?.id).toBe("gpt-4o-1");
    expect(attempts).toBe(1);

    const refresh = await app.request("/api/models/refresh", {
      method: "POST",
    });
    expect(refresh.status).toBe(200);

    const third = await app.request("/api/models");
    const thirdJson = (await third.json()) as {
      data: { models: Array<{ id: string }> };
      error: string | null;
    };
    expect(thirdJson.data.models[0]?.id).toBe("gpt-4o-2");
    expect(attempts).toBe(2);
  });

  it("updates models_introspection setting via settings route", async () => {
    const app = createApp({ services });

    const putRes = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "models_introspection",
        value: { environmentId: "env-1" },
      }),
    });

    expect(putRes.status).toBe(200);

    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, "models_introspection"))
      .get();

    expect(row).toBeDefined();
    expect(row?.value).toBe(JSON.stringify({ environmentId: "env-1" }));
  });
});
