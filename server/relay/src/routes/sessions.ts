import { join } from "node:path";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";
import { createLogger } from "../lib/logger";
import {
  type EnvironmentSandboxConfig,
  resolveEnvConfig,
} from "../sandbox/manager";
import type { SandboxProviderType } from "../sandbox/provider-types";
import type { EnvironmentConfig } from "../services/environment.service";
import type { SessionMode } from "../services/session.service";
import { readSessionHistory } from "../services/session-history";
import {
  buildSettingsJson,
  writeSessionSettings,
} from "../services/settings-generator";

interface CreateSessionRequest {
  mode: SessionMode;
  repoId?: string;
  environmentId?: string;
  modelProvider?: string;
  modelId?: string;
  systemPrompt?: string;
  /** Enable native tools bridge extension in the sandbox. */
  nativeToolsEnabled?: boolean;
}

interface ActivateSessionRequest {
  clientId: string;
}

interface ClientCapabilitiesRequest {
  clientKind?: "web" | "ios" | "macos" | "unknown";
  capabilities: {
    extensionUI: boolean;
  };
}

export function sessionsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger("sessions");

  // List all sessions
  app.get("/", (c) => {
    const sessionService = c.get("sessionService");
    const statusParam = c.req.query("status");
    const statusFilter = statusParam
      ? (statusParam.split(
          ",",
        ) as import("../services/session.service").SessionStatus[])
      : undefined;
    const sessions = sessionService.list(
      statusFilter ? { status: statusFilter } : undefined,
    );
    return c.json({ data: sessions, error: null });
  });

  // Create new session
  app.post("/", async (c) => {
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");
    const environmentService = c.get("environmentService");
    const repoService = c.get("repoService");
    const secretsService = c.get("secretsService");

    let body: CreateSessionRequest;
    try {
      body = await c.req.json<CreateSessionRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    // Validate mode
    if (!body.mode || !["chat", "code"].includes(body.mode)) {
      return c.json(
        { data: null, error: "mode must be 'chat' or 'code'" },
        400,
      );
    }

    // Code mode requires repoId
    if (body.mode === "code" && !body.repoId) {
      return c.json(
        { data: null, error: "repoId is required for code mode" },
        400,
      );
    }

    // Resolve environment, repo, and sandbox provider
    let environmentId: string | undefined;
    let sandboxProvider: SandboxProviderType;
    let repoUrl: string | undefined;
    let repoBranch: string | undefined;
    let githubToken: string | undefined;
    let environmentConfig: EnvironmentConfig | undefined;

    // Resolve environment for all modes
    {
      let environment: ReturnType<typeof environmentService.get>;
      if (body.environmentId) {
        environment = environmentService.get(body.environmentId);
        if (!environment) {
          return c.json({ data: null, error: "Environment not found" }, 404);
        }
      } else {
        environment = environmentService.getDefault();
        if (!environment) {
          return c.json(
            {
              data: null,
              error: "No environment specified and no default configured",
            },
            400,
          );
        }
      }

      environmentId = environment.id;
      sandboxProvider = environment.sandboxType as SandboxProviderType;
      environmentConfig = JSON.parse(environment.config);
    }

    if (body.mode === "code") {
      // Read GitHub token for repo resolution and sandbox git auth
      const db = c.get("db");
      const tokenSetting = db
        .select()
        .from(settings)
        .where(eq(settings.key, "github_repos_access_token"))
        .get();
      if (tokenSetting) {
        githubToken = JSON.parse(tokenSetting.value) as string;
      }

      // Resolve repo for cloning — fetch live from GitHub, persist on use
      if (body.repoId) {
        let repo = repoService.get(body.repoId);
        if (!repo && githubToken) {
          const githubService = c.get("githubService");
          try {
            const ghRepo = await githubService.getRepoById(
              githubToken,
              body.repoId,
            );
            repoService.upsert({
              id: String(ghRepo.id),
              name: ghRepo.name,
              fullName: ghRepo.fullName,
              owner: ghRepo.owner,
              isPrivate: ghRepo.isPrivate,
              description: ghRepo.description,
              htmlUrl: ghRepo.htmlUrl,
              cloneUrl: ghRepo.cloneUrl,
              sshUrl: ghRepo.sshUrl,
              defaultBranch: ghRepo.defaultBranch,
            });
            repo = repoService.get(body.repoId);
          } catch (err) {
            logger.error(
              { err, repoId: body.repoId },
              "failed to fetch repo from GitHub",
            );
          }
        }

        if (repo?.cloneUrl) {
          repoUrl = repo.cloneUrl;
          repoBranch = repo.defaultBranch ?? "main";
        }
      }
    }

    try {
      // Write settings.json with resolved extension packages
      const extensionConfigService = c.get("extensionConfigService");
      const sessionDataDir = c.get("sessionDataDir");

      // Create session in database
      const session = sessionService.create({
        mode: body.mode,
        repoId: body.repoId,
        branchName: repoBranch,
        environmentId,
        modelProvider: body.modelProvider,
        modelId: body.modelId,
        systemPrompt: body.systemPrompt,
        sandboxProvider,
      });

      // Write settings.json for extension packages (before sandbox starts)
      const packages = extensionConfigService.getResolvedPackages(
        session.id,
        body.mode as "chat" | "code",
      );
      writeSessionSettings(sessionDataDir, session.id, packages);

      // Read secrets fresh for sandbox injection
      const secrets = await secretsService.getAllAsEnv();

      // Resolve environment config
      let resolvedEnvConfig: EnvironmentSandboxConfig | undefined;
      if (environmentId) {
        const env = environmentService.get(environmentId);
        if (env) {
          resolvedEnvConfig = await resolveEnvConfig(env, secretsService);
        }
      }

      // Start sandbox provisioning (async, don't await)
      const createPromise =
        sandboxProvider === "mock"
          ? sandboxManager.createMockForSession(session.id, { secrets })
          : sandboxManager.createForSession(
              session.id,
              resolvedEnvConfig ?? {
                sandboxType: sandboxProvider as
                  | "docker"
                  | "cloudflare"
                  | "gondolin",
              },
              {
                repoUrl,
                repoBranch,
                githubToken,
                secrets,
                resourceTier: environmentConfig?.resourceTier,
                nativeToolsEnabled: body.nativeToolsEnabled,
              },
            );

      createPromise
        .then(async (handle) => {
          try {
            // For Cloudflare sandboxes, write settings.json via exec
            // (no bind mount available like Docker)
            if (
              sandboxProvider === "cloudflare" &&
              packages.length > 0 &&
              handle.exec
            ) {
              const settingsJson = buildSettingsJson(packages);
              const escaped = settingsJson.replace(/'/g, "'\\''");
              await handle.exec(
                `mkdir -p /data/agent && printf '%s\\n' '${escaped}' > /data/agent/settings.json`,
              );
            }

            sessionService.update(session.id, {
              status: "active",
              sandboxProviderId: handle.providerId,
              sandboxImageDigest: handle.imageDigest,
            });
          } catch (err) {
            logger.error(
              { err, sessionId: session.id },
              "failed to update session after sandbox creation",
            );
          }
        })
        .catch((err) => {
          logger.error(
            { err, sessionId: session.id },
            "failed to create sandbox",
          );
          try {
            sessionService.update(session.id, { status: "error" });
          } catch (_updateErr) {
            // Database may be closed during test teardown - ignore
          }
        });

      return c.json({
        data: {
          ...session,
          wsEndpoint: `/ws/sessions/${session.id}`,
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to create session");
      const message =
        err instanceof Error ? err.message : "Failed to create session";
      return c.json({ data: null, error: message }, 500);
    }
  });

  // Get single session by ID
  app.get("/:id", (c) => {
    const sessionService = c.get("sessionService");
    const id = c.req.param("id");
    const session = sessionService.get(id);

    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    return c.json({ data: session, error: null });
  });

  // Activate session: ensure sandbox is running, block until ready.
  // Client calls this before opening WebSocket.
  app.post("/:id/activate", async (c) => {
    const activateStartedAt = Date.now();
    const db = c.get("db");
    const sessionService = c.get("sessionService");
    const eventJournal = c.get("eventJournal");
    const sandboxManager = c.get("sandboxManager");
    const secretsService = c.get("secretsService");
    const sessionHubManager = c.get("sessionHubManager");
    const id = c.req.param("id");

    // Parse clientId from body (required)
    let body: ActivateSessionRequest;
    try {
      body = await c.req.json<ActivateSessionRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (!body.clientId || typeof body.clientId !== "string") {
      return c.json({ data: null, error: "clientId is required" }, 400);
    }

    const session = sessionService.get(id);
    logger.debug(
      {
        sessionId: id,
        status: session?.status,
        provider: session?.sandboxProvider,
        providerId: session?.sandboxProviderId,
        clientId: body.clientId,
      },
      "activate start",
    );
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    // Set activator client if provided
    if (body.clientId) {
      sessionHubManager.setActivatorClient(id, body.clientId);
    }

    if (session.status === "archived") {
      return c.json({ data: null, error: "Session has been archived" }, 410);
    }

    if (session.status === "error") {
      logger.error(
        {
          sessionId: id,
          provider: session.sandboxProvider,
          providerId: session.sandboxProviderId,
        },
        "activate rejected: session in error state",
      );
      return c.json({ data: null, error: "Session is in error state" }, 409);
    }

    // If sandbox is still being provisioned, poll until ready
    const maxWaitMs = 60_000;
    const pollIntervalMs = 500;
    let waited = 0;

    while (waited < maxWaitMs) {
      const current = sessionService.get(id);
      if (!current) {
        return c.json({ data: null, error: "Session not found" }, 404);
      }

      if (current.status === "error") {
        return c.json(
          { data: null, error: "Sandbox provisioning failed" },
          500,
        );
      }

      if (current.sandboxProviderId && current.sandboxProvider) {
        // Sandbox provisioned — resume it with fresh secrets
        try {
          logger.info(
            {
              sessionId: id,
              provider: current.sandboxProvider,
              providerId: current.sandboxProviderId,
              status: current.status,
            },
            "activate: resuming sandbox",
          );

          // Regenerate settings.json (picks up extension config changes)
          const settingsStartedAt = Date.now();
          const extensionConfigService = c.get("extensionConfigService");
          const sessionDataDir = c.get("sessionDataDir");
          const extPackages = extensionConfigService.getResolvedPackages(
            id,
            current.mode as "chat" | "code",
          );
          writeSessionSettings(sessionDataDir, id, extPackages);
          logger.debug(
            {
              sessionId: id,
              elapsedMs: Date.now() - settingsStartedAt,
              packages: extPackages.length,
            },
            "activate settings-written",
          );

          const secretsStartedAt = Date.now();
          const secrets = await secretsService.getAllAsEnv();
          logger.debug(
            {
              sessionId: id,
              elapsedMs: Date.now() - secretsStartedAt,
              keys: Object.keys(secrets).length,
            },
            "activate secrets-loaded",
          );
          // Read GitHub token for git credential refresh
          const tokenSetting = db
            .select()
            .from(settings)
            .where(eq(settings.key, "github_repos_access_token"))
            .get();
          const ghToken = tokenSetting
            ? (JSON.parse(tokenSetting.value) as string)
            : undefined;
          logger.info(
            {
              sessionId: id,
              secretCount: Object.keys(secrets).length,
              keys: Object.keys(secrets),
            },
            "activate: secrets loaded",
          );
          // Resolve environment config for the provider
          const envResolveStartedAt = Date.now();
          let envConfig: EnvironmentSandboxConfig | undefined;
          if (current.environmentId) {
            const environmentService = c.get("environmentService");
            const env = environmentService.get(current.environmentId);
            if (env) {
              envConfig = await resolveEnvConfig(env, secretsService);
            }
          }
          logger.debug(
            {
              sessionId: id,
              elapsedMs: Date.now() - envResolveStartedAt,
              hasEnvConfig: Boolean(envConfig),
            },
            "activate env-resolved",
          );

          const resumeStartedAt = Date.now();
          const handle = await sandboxManager.resumeSession(
            current.sandboxProvider as SandboxProviderType,
            current.sandboxProviderId,
            envConfig,
            secrets,
            ghToken,
          );
          logger.debug(
            {
              sessionId: id,
              elapsedMs: Date.now() - resumeStartedAt,
              sandboxStatus: handle.status,
            },
            "activate resume-done",
          );
          logger.info(
            { sessionId: id, sandboxStatus: handle.status },
            "activate: sandbox resumed",
          );

          // For Cloudflare, write settings.json via exec after resume
          if (
            current.sandboxProvider === "cloudflare" &&
            extPackages.length > 0 &&
            handle.exec
          ) {
            const settingsJson = buildSettingsJson(extPackages);
            const escaped = settingsJson.replace(/'/g, "'\\''");
            await handle.exec(
              `mkdir -p /data/agent && printf '%s\\n' '${escaped}' > /data/agent/settings.json`,
            );
          }

          // Update status to active and clear stale extensions flag
          if (current.status !== "active" || current.extensionsStale) {
            sessionService.update(id, {
              status: "active",
              extensionsStale: false,
            });
          }

          const lastSeq = eventJournal.getMaxSeq(id);
          logger.debug(
            { sessionId: id, totalElapsedMs: Date.now() - activateStartedAt },
            "activate done",
          );

          return c.json({
            data: {
              sessionId: id,
              status: "active",
              lastSeq,
              sandboxStatus: handle.status,
              wsEndpoint: `/ws/sessions/${id}`,
            },
            error: null,
          });
        } catch (err) {
          logger.error({ err, sessionId: id }, "activate error");
          const message =
            err instanceof Error ? err.message : "Sandbox unavailable";
          return c.json(
            { data: null, error: `Sandbox unavailable: ${message}` },
            503,
          );
        }
      }

      // Still creating — wait and retry
      if (waited === 0 || waited % 5_000 === 0) {
        logger.debug(
          {
            sessionId: id,
            waitedMs: waited,
            status: current.status,
            providerId: current.sandboxProviderId,
          },
          "activate waiting",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;
    }

    return c.json(
      { data: null, error: "Timed out waiting for sandbox to provision" },
      504,
    );
  });

  // Get sandbox stderr logs for a session (diagnostics)
  app.get("/:id/logs", (c) => {
    const sessionService = c.get("sessionService");
    const sandboxLogStore = c.get("sandboxLogStore");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    const lines = sandboxLogStore.get(id);
    return c.json({ data: { lines }, error: null });
  });

  // Get recent events for a session (for dashboard)
  app.get("/:id/events", (c) => {
    const sessionService = c.get("sessionService");
    const eventJournal = c.get("eventJournal");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    const afterSeqParam = c.req.query("afterSeq");
    const limitParam = c.req.query("limit");
    const afterSeq = afterSeqParam ? Number.parseInt(afterSeqParam, 10) : 0;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

    const events = eventJournal.getAfterSeq(id, afterSeq, limit);
    const lastEvent = events[events.length - 1];

    return c.json({
      data: {
        events: events.map((e) => ({
          seq: e.seq,
          type: e.type,
          payload: JSON.parse(e.payload),
          createdAt: e.createdAt,
        })),
        lastSeq: lastEvent ? lastEvent.seq : afterSeq,
      },
      error: null,
    });
  });

  // Get session history from JSONL file (pi's persisted session entries)
  app.get("/:id/history", (c) => {
    const sessionService = c.get("sessionService");
    const sessionDataDir = c.get("sessionDataDir");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    const agentDir = join(sessionDataDir, id, "agent");
    const entries = readSessionHistory(agentDir);

    return c.json({
      data: {
        entries: entries ?? [],
      },
      error: null,
    });
  });

  // Register client capabilities for a session
  app.put("/:id/clients/:clientId/capabilities", async (c) => {
    const sessionService = c.get("sessionService");
    const sessionHubManager = c.get("sessionHubManager");
    const id = c.req.param("id");
    const clientId = c.req.param("clientId");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    let body: ClientCapabilitiesRequest;
    try {
      body = await c.req.json<ClientCapabilitiesRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (
      !body.capabilities ||
      typeof body.capabilities.extensionUI !== "boolean"
    ) {
      return c.json(
        { data: null, error: "capabilities.extensionUI is required" },
        400,
      );
    }

    sessionHubManager.setClientCapabilities(id, clientId, {
      extensionUI: body.capabilities.extensionUI,
      clientKind: body.clientKind ?? "unknown",
    });

    return c.json({
      data: {
        sessionId: id,
        clientId,
        capabilities: body.capabilities,
      },
      error: null,
    });
  });

  // Archive a session (stop sandbox, mark as archived)
  app.post("/:id/archive", async (c) => {
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    if (session.status === "archived") {
      return c.json({ data: { ok: true }, error: null });
    }

    // Terminate sandbox if running
    if (session.sandboxProvider && session.sandboxProviderId) {
      let envConfig: EnvironmentSandboxConfig | undefined;
      if (session.environmentId) {
        const environmentService = c.get("environmentService");
        const env = environmentService.get(session.environmentId);
        if (env) {
          const secretsService = c.get("secretsService");
          envConfig = await resolveEnvConfig(env, secretsService);
        }
      }
      await sandboxManager.terminateByProviderId(
        session.sandboxProvider as SandboxProviderType,
        session.sandboxProviderId,
        envConfig,
      );
    }

    sessionService.archive(id);
    c.get("sandboxLogStore").clear(id);

    return c.json({ data: { ok: true }, error: null });
  });

  // Hard delete a session (permanently removes from DB)
  app.delete("/:id", async (c) => {
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    // Terminate sandbox if still running
    if (session.sandboxProvider && session.sandboxProviderId) {
      let envConfig: EnvironmentSandboxConfig | undefined;
      if (session.environmentId) {
        const environmentService = c.get("environmentService");
        const env = environmentService.get(session.environmentId);
        if (env) {
          const secretsService = c.get("secretsService");
          envConfig = await resolveEnvConfig(env, secretsService);
        }
      }
      await sandboxManager.terminateByProviderId(
        session.sandboxProvider as SandboxProviderType,
        session.sandboxProviderId,
        envConfig,
      );
    }

    sessionService.delete(id);
    c.get("sandboxLogStore").clear(id);

    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
