import { Hono } from "hono";
import type { AppEnv } from "../app";

const VERSION = "0.1.0";

export function healthRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => {
    return c.json({ ok: true, version: VERSION });
  });

  // Server info at /api root
  app.get("/api", (c) => {
    return c.json({
      name: "pi-relay",
      version: VERSION,
      endpoints: {
        health: "GET /health",
        sessions: "GET /api/sessions",
        session: "GET /api/sessions/:id",
        githubToken: "GET|POST|DELETE /api/github/token",
        githubRepos: "GET /api/github/repos",
        settings: "GET|PUT /api/settings",
        rpc: "WS /rpc (not yet implemented)",
      },
    });
  });

  return app;
}
