import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { SessionMode } from "../services/session.service";

interface CreateSessionRequest {
  mode: SessionMode;
  repoId?: string;
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

    try {
      // Create session in database
      const session = sessionService.create({
        mode: body.mode,
        repoId: body.repoId,
        modelProvider: body.modelProvider,
        modelId: body.modelId,
        systemPrompt: body.systemPrompt,
      });

      // Start sandbox provisioning (async, don't await)
      sandboxManager
        .createForSession(session.id)
        .then(() => {
          sessionService.update(session.id, { status: "ready" });
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

  // Get connection info for existing session
  app.get("/:id/connect", (c) => {
    const sessionService = c.get("sessionService");
    const eventJournal = c.get("eventJournal");
    const sandboxManager = c.get("sandboxManager");
    const id = c.req.param("id");

    const session = sessionService.get(id);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    if (session.status === "deleted") {
      return c.json({ data: null, error: "Session has been deleted" }, 410);
    }

    const lastSeq = eventJournal.getMaxSeq(id);
    const sandbox = sandboxManager.getForSession(id);

    return c.json({
      data: {
        sessionId: session.id,
        status: session.status,
        lastSeq,
        sandboxReady: !!sandbox,
        wsEndpoint: `/ws/sessions/${session.id}`,
      },
      error: null,
    });
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
    await sandboxManager.terminateForSession(id);

    // Delete session (cascade deletes events)
    sessionService.delete(id);

    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
