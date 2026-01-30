import { Hono } from "hono";
import type { AppEnv } from "../app";

export function sessionsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List all sessions
  app.get("/", (c) => {
    const sessionService = c.get("sessionService");
    const sessions = sessionService.list();
    return c.json({ data: sessions, error: null });
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

  return app;
}
