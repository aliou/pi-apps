import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { sessions } from "../db/schema";
import type { EnvironmentSandboxConfig } from "../sandbox/manager";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
} from "../test-helpers";
import type { ConnectionManager } from "../ws/connection";
import type { ServerEvent } from "../ws/types";
import { EnvironmentService } from "./environment.service";
import { IdleReaper, type IdleReaperDeps } from "./idle-reaper";
import { SessionService } from "./session.service";

function createTestDeps(overrides?: Partial<IdleReaperDeps>): {
  deps: IdleReaperDeps;
  db: AppDatabase;
  sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  sessionService: SessionService;
  environmentService: EnvironmentService;
  broadcasts: { sessionId: string; event: ServerEvent }[];
} {
  const { db, sqlite } = createTestDatabase();
  const sessionService = new SessionService(db);
  const environmentService = new EnvironmentService(db);
  const secretsService = createTestSecretsService(db);
  const sandboxManager = createTestSandboxManager();
  const broadcasts: { sessionId: string; event: ServerEvent }[] = [];

  const connectionManager = {
    broadcast: (sessionId: string, event: ServerEvent) => {
      broadcasts.push({ sessionId, event });
    },
  } as unknown as ConnectionManager;

  const mockResolveEnvConfig = async (env: {
    config: string;
    sandboxType: string;
  }) => {
    const config = JSON.parse(env.config);
    return {
      sandboxType: env.sandboxType as "docker" | "cloudflare",
      image: config.image,
      workerUrl: config.workerUrl,
    } satisfies EnvironmentSandboxConfig;
  };

  // Override getHandleByType to return a mock handle with a no-op pause()
  const origGetHandleByType =
    sandboxManager.getHandleByType.bind(sandboxManager);
  sandboxManager.getHandleByType = async (
    providerType,
    providerId,
    envConfig,
  ) => {
    if (providerType === "mock") {
      return origGetHandleByType(providerType, providerId, envConfig);
    }
    // Return a minimal mock handle for docker/cloudflare
    return {
      sessionId: "test",
      providerId,
      status: "running" as const,
      resume: async () => {},
      attach: async () => {
        throw new Error("not implemented");
      },
      pause: async () => {},
      terminate: async () => {},
      onStatusChange: () => () => {},
    };
  };

  const deps: IdleReaperDeps = {
    sessionService,
    environmentService,
    secretsService,
    sandboxManager,
    connectionManager,
    resolveEnvConfig:
      mockResolveEnvConfig as IdleReaperDeps["resolveEnvConfig"],
    checkIntervalMs: 60_000,
    ...overrides,
  };

  return { deps, db, sqlite, sessionService, environmentService, broadcasts };
}

/** Create a Docker environment and return its ID. */
function createDockerEnv(
  envService: EnvironmentService,
  opts?: { idleTimeoutSeconds?: number },
): string {
  const env = envService.create({
    name: "test-docker",
    sandboxType: "docker",
    config: {
      image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest",
      idleTimeoutSeconds: opts?.idleTimeoutSeconds ?? 3600,
    },
  });
  return env.id;
}

/** Create a Cloudflare environment and return its ID. */
function createCloudflareEnv(envService: EnvironmentService): string {
  const env = envService.create({
    name: "test-cf",
    sandboxType: "cloudflare",
    config: {
      workerUrl: "https://example.com",
      secretId: "fake-secret",
      idleTimeoutSeconds: 3600,
    },
  });
  return env.id;
}

/** Create a session that's been idle for the given number of seconds. */
function createIdleSession(
  sessionService: SessionService,
  environmentId: string,
  idleSeconds: number,
): string {
  const session = sessionService.create({
    mode: "chat",
    sandboxProvider: "docker",
    sandboxProviderId: `container-${crypto.randomUUID().slice(0, 8)}`,
    environmentId,
  });

  // Set to active
  sessionService.update(session.id, { status: "active" });

  // Backdate lastActivityAt directly to avoid update()'s touch() side-effect
  const pastTime = new Date(Date.now() - idleSeconds * 1000).toISOString();
  const db = (sessionService as unknown as { db: AppDatabase }).db;
  db.update(sessions)
    .set({ lastActivityAt: pastTime })
    .where(eq(sessions.id, session.id))
    .run();

  return session.id;
}

describe("IdleReaper", () => {
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];

  afterEach(() => {
    sqlite?.close();
  });

  it("suspends idle session past timeout", async () => {
    const {
      deps,
      sqlite: s,
      sessionService,
      environmentService,
      broadcasts,
    } = createTestDeps();
    sqlite = s;

    const envId = createDockerEnv(environmentService, {
      idleTimeoutSeconds: 300,
    });
    const sessionId = createIdleSession(sessionService, envId, 600); // idle 10min, timeout 5min

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    const session = sessionService.get(sessionId);
    expect(session?.status).toBe("suspended");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.sessionId).toBe(sessionId);
    expect(broadcasts[0]?.event).toMatchObject({
      type: "sandbox_status",
      status: "paused",
    });
  });

  it("does not suspend active (non-idle) session", async () => {
    const {
      deps,
      sqlite: s,
      sessionService,
      environmentService,
      broadcasts,
    } = createTestDeps();
    sqlite = s;

    const envId = createDockerEnv(environmentService, {
      idleTimeoutSeconds: 3600,
    });
    const sessionId = createIdleSession(sessionService, envId, 60); // idle 1min, timeout 1hr

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    const session = sessionService.get(sessionId);
    expect(session?.status).toBe("active");
    expect(broadcasts).toHaveLength(0);
  });

  it("respects per-environment timeout", async () => {
    const {
      deps,
      sqlite: s,
      sessionService,
      environmentService,
    } = createTestDeps();
    sqlite = s;

    const shortEnvId = createDockerEnv(environmentService, {
      idleTimeoutSeconds: 60,
    });
    const longEnvId = createDockerEnv(environmentService, {
      idleTimeoutSeconds: 7200,
    });

    const shortSessionId = createIdleSession(sessionService, shortEnvId, 120); // idle 2min
    const longSessionId = createIdleSession(sessionService, longEnvId, 120); // idle 2min

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    expect(sessionService.get(shortSessionId)?.status).toBe("suspended");
    expect(sessionService.get(longSessionId)?.status).toBe("active");
  });

  it("skips Cloudflare environment sessions", async () => {
    const {
      deps,
      sqlite: s,
      sessionService,
      environmentService,
    } = createTestDeps();
    sqlite = s;

    const envId = createCloudflareEnv(environmentService);
    // Create session manually since createIdleSession assumes docker
    const session = sessionService.create({
      mode: "chat",
      sandboxProvider: "cloudflare",
      sandboxProviderId: "cf-instance-1",
      environmentId: envId,
    });
    sessionService.update(session.id, { status: "active" });

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    expect(sessionService.get(session.id)?.status).toBe("active");
  });

  it("skips sessions without environmentId (chat/mock)", async () => {
    const { deps, sqlite: s, sessionService } = createTestDeps();
    sqlite = s;

    const session = sessionService.create({ mode: "chat" });
    sessionService.update(session.id, { status: "active" });

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    expect(sessionService.get(session.id)?.status).toBe("active");
  });

  it("continues processing after one session fails", async () => {
    const {
      deps,
      sqlite: s,
      sessionService,
      environmentService,
    } = createTestDeps();
    sqlite = s;

    const envId = createDockerEnv(environmentService, {
      idleTimeoutSeconds: 60,
    });
    const failSessionId = createIdleSession(sessionService, envId, 300);
    const okSessionId = createIdleSession(sessionService, envId, 300);

    // Make getHandleByType throw for the first session
    const origGetHandle = deps.sandboxManager.getHandleByType.bind(
      deps.sandboxManager,
    );
    let callCount = 0;
    deps.sandboxManager.getHandleByType = async (...args) => {
      callCount++;
      if (callCount === 1) throw new Error("container gone");
      return origGetHandle(...args);
    };

    const reaper = new IdleReaper(deps);
    await reaper.tick();

    // One should have failed, the other should still be processed
    // (order is not guaranteed, so check that at least one was suspended)
    const statuses = [
      sessionService.get(failSessionId)?.status,
      sessionService.get(okSessionId)?.status,
    ];
    expect(statuses).toContain("suspended");
  });

  it("start/stop lifecycle works cleanly", async () => {
    const { deps, sqlite: s } = createTestDeps({ checkIntervalMs: 50 });
    sqlite = s;

    const reaper = new IdleReaper(deps);
    reaper.start();

    // Let it tick once
    await new Promise((r) => setTimeout(r, 100));

    // Should not throw
    reaper.stop();
  });
});

describe("SessionService.listActiveSessions", () => {
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];

  afterEach(() => {
    sqlite?.close();
  });

  it("returns only active sessions", () => {
    const { db, sqlite: s } = createTestDatabase();
    sqlite = s;
    const service = new SessionService(db);

    const active = service.create({ mode: "chat" });
    service.update(active.id, { status: "active" });

    const suspended = service.create({ mode: "chat" });
    service.update(suspended.id, { status: "suspended" });

    service.create({ mode: "chat" });
    // stays 'creating'

    const errored = service.create({ mode: "chat" });
    service.update(errored.id, { status: "error" });

    const result = service.listActiveSessions();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(active.id);
  });
});
