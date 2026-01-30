import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";

const GITHUB_TOKEN_KEY = "github_token";

export function githubRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Get token status
  app.get("/token", async (c) => {
    const db = c.get("db");
    const githubService = c.get("githubService");

    const setting = db
      .select()
      .from(settings)
      .where(eq(settings.key, GITHUB_TOKEN_KEY))
      .get();

    if (!setting) {
      return c.json({ data: { configured: false }, error: null });
    }

    const token = JSON.parse(setting.value) as string;
    const info = await githubService.validateToken(token);

    if (!info.valid) {
      return c.json({
        data: { configured: true, valid: false, error: info.error },
        error: null,
      });
    }

    return c.json({
      data: {
        configured: true,
        valid: true,
        user: info.user,
        scopes: info.scopes,
        rateLimitRemaining: info.rateLimitRemaining,
      },
      error: null,
    });
  });

  // Set token
  app.post("/token", async (c) => {
    const db = c.get("db");
    const githubService = c.get("githubService");

    let body: { token?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const token = body.token;
    if (!token || typeof token !== "string" || token.trim() === "") {
      return c.json({ data: null, error: "Token is required" }, 400);
    }

    // Validate token before storing
    const info = await githubService.validateToken(token.trim());
    if (!info.valid) {
      return c.json({ data: null, error: info.error ?? "Invalid token" }, 400);
    }

    // Store token
    const now = new Date().toISOString();
    const existing = db
      .select()
      .from(settings)
      .where(eq(settings.key, GITHUB_TOKEN_KEY))
      .get();

    if (existing) {
      db.update(settings)
        .set({ value: JSON.stringify(token.trim()), updatedAt: now })
        .where(eq(settings.key, GITHUB_TOKEN_KEY))
        .run();
    } else {
      db.insert(settings)
        .values({
          key: GITHUB_TOKEN_KEY,
          value: JSON.stringify(token.trim()),
          updatedAt: now,
        })
        .run();
    }

    return c.json({
      data: {
        user: info.user,
        scopes: info.scopes,
      },
      error: null,
    });
  });

  // Delete token
  app.delete("/token", (c) => {
    const db = c.get("db");
    db.delete(settings).where(eq(settings.key, GITHUB_TOKEN_KEY)).run();
    return c.json({ data: { ok: true }, error: null });
  });

  // List repos
  app.get("/repos", async (c) => {
    const db = c.get("db");
    const githubService = c.get("githubService");

    const setting = db
      .select()
      .from(settings)
      .where(eq(settings.key, GITHUB_TOKEN_KEY))
      .get();

    if (!setting) {
      return c.json({ data: null, error: "GitHub token not configured" }, 401);
    }

    const token = JSON.parse(setting.value) as string;

    try {
      const repos = await githubService.listRepos(token);
      return c.json({ data: repos, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to list repos";
      return c.json({ data: null, error: message }, 500);
    }
  });

  return app;
}
