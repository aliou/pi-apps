import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";
import { createLogger } from "../lib/logger";
import {
  GITHUB_APP_CONFIG_KEY,
  type GitHubAppConnectRequest,
} from "../services/github-app.service";

export const GITHUB_TOKEN_KEY = "github_repos_access_token";

export function githubRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger("github");

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

    const token = parseSettingString(setting.value);
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

  app.post("/token", async (c) => {
    const db = c.get("db");
    const githubService = c.get("githubService");

    let body: { token?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const token = body.token?.trim();
    if (!token) {
      return c.json({ data: null, error: "Token is required" }, 400);
    }

    const info = await githubService.validateToken(token);
    if (!info.valid) {
      return c.json({ data: null, error: info.error ?? "Invalid token" }, 400);
    }

    upsertSetting(db, GITHUB_TOKEN_KEY, token);

    return c.json({
      data: {
        user: info.user,
        scopes: info.scopes,
      },
      error: null,
    });
  });

  app.delete("/token", (c) => {
    c.get("db")
      .delete(settings)
      .where(eq(settings.key, GITHUB_TOKEN_KEY))
      .run();
    return c.json({ data: { ok: true }, error: null });
  });

  app.get("/repos", async (c) => {
    const githubService = c.get("githubService");
    const repoService = c.get("repoService");

    try {
      const result = await githubService.listAccessibleRepos();
      for (const repo of result.repos) {
        repoService.upsert({
          id: String(repo.id),
          name: repo.name,
          fullName: repo.fullName,
          owner: repo.owner,
          isPrivate: repo.isPrivate,
          description: repo.description,
          htmlUrl: repo.htmlUrl,
          cloneUrl: repo.cloneUrl,
          sshUrl: repo.sshUrl,
          defaultBranch: repo.defaultBranch,
        });
      }

      return c.json({
        data: {
          mode: result.mode,
          repos: result.repos,
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to list repos");
      const message =
        err instanceof Error ? err.message : "Failed to list repos";
      const status = message.includes("not configured") ? 401 : 500;
      return c.json({ data: null, error: message }, status);
    }
  });

  app.get("/app/status", async (c) => {
    try {
      const githubService = c.get("githubService");
      const status = await githubService.getAuthStatus();
      return c.json({
        data: {
          ...status.app,
          preferredMode: status.preferredMode,
          patConfigured: status.pat.configured,
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to get app status");
      return c.json(
        {
          data: null,
          error:
            err instanceof Error ? err.message : "Failed to get app status",
        },
        500,
      );
    }
  });

  app.post("/app/connect", async (c) => {
    const githubAppService = c.get("githubAppService");

    let body: Partial<GitHubAppConnectRequest>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (!Number.isInteger(body.appId) || (body.appId ?? 0) <= 0) {
      return c.json({ data: null, error: "appId is required" }, 400);
    }

    if (!body.privateKey?.trim()) {
      return c.json({ data: null, error: "privateKey is required" }, 400);
    }

    try {
      await githubAppService.connect({
        appId: body.appId as number,
        privateKey: body.privateKey,
        webhookSecret: body.webhookSecret,
        installationIds: body.installationIds,
      });

      const config = c
        .get("db")
        .select()
        .from(settings)
        .where(eq(settings.key, GITHUB_APP_CONFIG_KEY))
        .get();

      return c.json({
        data: {
          ok: true,
          config: config ? JSON.parse(config.value) : null,
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to connect GitHub App");
      return c.json(
        {
          data: null,
          error:
            err instanceof Error ? err.message : "Failed to connect GitHub App",
        },
        400,
      );
    }
  });

  app.delete("/app/connect", async (c) => {
    try {
      await c.get("githubAppService").disconnect();
      return c.json({ data: { ok: true }, error: null });
    } catch (err) {
      logger.error({ err }, "failed to disconnect GitHub App");
      return c.json(
        {
          data: null,
          error:
            err instanceof Error
              ? err.message
              : "Failed to disconnect GitHub App",
        },
        500,
      );
    }
  });

  app.get("/app/installations", async (c) => {
    try {
      const installations = await c.get("githubAppService").listInstallations();
      return c.json({ data: installations, error: null });
    } catch (err) {
      logger.error({ err }, "failed to list app installations");
      const message =
        err instanceof Error ? err.message : "Failed to list app installations";
      const status = message.includes("not configured") ? 404 : 500;
      return c.json({ data: null, error: message }, status);
    }
  });

  return app;
}

function parseSettingString(value: string): string {
  try {
    return JSON.parse(value) as string;
  } catch {
    return value;
  }
}

function upsertSetting(
  db: AppEnv["Variables"]["db"],
  key: string,
  value: string,
): void {
  const now = new Date().toISOString();
  const existing = db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .get();

  if (existing) {
    db.update(settings)
      .set({ value: JSON.stringify(value), updatedAt: now })
      .where(eq(settings.key, key))
      .run();
    return;
  }

  db.insert(settings)
    .values({
      key,
      value: JSON.stringify(value),
      updatedAt: now,
    })
    .run();
}
