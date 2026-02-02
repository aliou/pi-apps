import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";
import type { SandboxProviderType } from "../sandbox/manager";
import type { DockerEnvironmentConfig } from "../services/environment.service";
import type { SessionMode } from "../services/session.service";

interface CreateSessionRequest {
  mode: SessionMode;
  repoId?: string;
  environmentId?: string;
  modelProvider?: string;
  modelId?: string;
  systemPrompt?: string;
}

export function sessionsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List all sessions
  app.get("/", (c) => {
    const sessionService = c.get("sessionService");
    const sessions = sessionService.list();
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

    // Resolve environment, repo, and sandbox provider for code mode
    let environmentId: string | undefined;
    let sandboxProvider: SandboxProviderType =
      sandboxManager.defaultProviderName;
    let repoUrl: string | undefined;
    let repoBranch: string | undefined;
    let environmentConfig: DockerEnvironmentConfig | undefined;

    if (body.mode === "code") {
      // Resolve environment
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

      // Resolve repo for cloning — fetch live from GitHub, persist on use
      if (body.repoId) {
        let repo = repoService.get(body.repoId);
        if (!repo) {
          const db = c.get("db");
          const githubService = c.get("githubService");
          const setting = db
            .select()
            .from(settings)
            .where(eq(settings.key, "github_repos_access_token"))
            .get();

          if (setting) {
            try {
              const token = JSON.parse(setting.value) as string;
              const ghRepo = await githubService.getRepoById(
                token,
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
              console.error(
                `Failed to fetch repo ${body.repoId} from GitHub:`,
                err,
              );
            }
          }
        }

        if (repo?.cloneUrl) {
          repoUrl = repo.cloneUrl;
          repoBranch = repo.defaultBranch ?? "main";
        }
      }
    }

    try {
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

      // Read secrets fresh for sandbox injection
      const secrets = await secretsService.getAllAsEnv();

      // Start sandbox provisioning (async, don't await)
      sandboxManager
        .createForSession(
          session.id,
          {
            repoUrl,
            repoBranch,
            secrets,
            resources: environmentConfig?.resources,
          },
          sandboxProvider,
        )
        .then((handle) => {
          sessionService.update(session.id, {
            status: "active",
            sandboxProviderId: handle.providerId,
            sandboxImageDigest: handle.imageDigest,
          });
        })
        .catch((err) => {
          console.error(
            `Failed to create sandbox for session ${session.id}:`,
            err,
          );
          sessionService.update(session.id, { status: "error" });
        });

      return c.json({
        data: {
          ...session,
          wsEndpoint: `/ws/sessions/${session.id}`,
        },
        error: null,
      });
    } catch (err) {
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
    const sessionService = c.get("sessionService");
    const eventJournal = c.get("eventJournal");
    const sandboxManager = c.get("sandboxManager");
    const secretsService = c.get("secretsService");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    if (session.status === "deleted") {
      return c.json({ data: null, error: "Session has been deleted" }, 410);
    }

    if (session.status === "error") {
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
          console.log(
            `[activate] session=${id} provider=${current.sandboxProvider} providerId=${current.sandboxProviderId} status=${current.status}`,
          );
          const secrets = await secretsService.getAllAsEnv();
          console.log(
            `[activate] session=${id} secrets=${Object.keys(secrets).length} keys=[${Object.keys(secrets).join(",")}]`,
          );
          const handle = await sandboxManager.resumeSession(
            current.sandboxProvider as SandboxProviderType,
            current.sandboxProviderId,
            secrets,
          );
          console.log(
            `[activate] session=${id} resumed, sandboxStatus=${handle.status}`,
          );

          // Update status to active
          if (current.status !== "active") {
            sessionService.update(id, { status: "active" });
          }

          const lastSeq = eventJournal.getMaxSeq(id);

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
          console.error(`[activate] session=${id} error:`, err);
          const message =
            err instanceof Error ? err.message : "Sandbox unavailable";
          return c.json(
            { data: null, error: `Sandbox unavailable: ${message}` },
            503,
          );
        }
      }

      // Still creating — wait and retry
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;
    }

    return c.json(
      { data: null, error: "Timed out waiting for sandbox to provision" },
      504,
    );
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

  // Delete a session
  app.delete("/:id", async (c) => {
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    // Terminate sandbox if running
    if (session.sandboxProvider && session.sandboxProviderId) {
      await sandboxManager.terminateByProviderId(
        session.sandboxProvider as SandboxProviderType,
        session.sandboxProviderId,
      );
    }

    // Delete session (cascade deletes events)
    sessionService.delete(id);

    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
