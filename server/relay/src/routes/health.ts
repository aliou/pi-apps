import { Hono } from "hono";
import type { AppEnv } from "../app";

const VERSION = "0.1.0";
// Replaced at build time by esbuild define; at runtime (tsx dev) reads the env var.
const COMMIT = process.env.GIT_COMMIT ?? "dev";

export function healthRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => {
    return c.json({ ok: true, version: VERSION, commit: COMMIT });
  });

  // Server info at /api root
  app.get("/api", (c) => {
    return c.json({
      name: "pi-relay",
      version: VERSION,
      commit: COMMIT,
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
