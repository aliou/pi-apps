import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";

// Keys that should not be exposed via the general settings API
const PROTECTED_KEYS = ["github_repos_access_token"];

interface CfTokenVerifyResult {
  valid: boolean;
  status?: string;
  expiresOn?: string;
  error?: string;
}

/**
 * Verify a Cloudflare API token via /user/tokens/verify.
 * Only checks validity and status -- does not read permissions
 * (that would require API Tokens Read scope).
 */
async function verifyCfToken(token: string): Promise<CfTokenVerifyResult> {
  const res = await fetch(
    "https://api.cloudflare.com/client/v4/user/tokens/verify",
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    return { valid: false, error: `HTTP ${res.status}` };
  }

  const json = (await res.json()) as {
    success: boolean;
    result?: { status: string; expires_on?: string };
    errors?: Array<{ message: string }>;
  };

  if (!json.success || !json.result) {
    const msg = json.errors?.[0]?.message ?? "Token verification failed";
    return { valid: false, error: msg };
  }

  const { status, expires_on } = json.result;

  if (status !== "active") {
    return { valid: false, status, error: `Token is ${status}` };
  }

  return {
    valid: true,
    status,
    expiresOn: expires_on ?? undefined,
  };
}

export function settingsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Verify a Cloudflare API token (validity only, no permission introspection)
  app.post("/verify-cf-token", async (c) => {
    let body: { token?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (!body.token || typeof body.token !== "string" || !body.token.trim()) {
      return c.json({ data: null, error: "token is required" }, 400);
    }

    const result = await verifyCfToken(body.token.trim());
    return c.json({ data: result, error: null });
  });

  // Get sandbox provider status
  app.get("/sandbox-providers", async (c) => {
    const sandboxManager = c.get("sandboxManager");
    const secretsService = c.get("secretsService");

    // Check Docker availability
    let dockerAvailable = false;
    try {
      dockerAvailable = await sandboxManager.isProviderAvailable({
        sandboxType: "docker",
        image: "pi-sandbox:local", // dummy image, just checks Docker daemon
      });
    } catch {
      // Docker not available
    }

    // Check if CF API token is configured
    const cfToken = await secretsService.getValueByEnvVar(
      "SANDBOX_CF_API_TOKEN",
    );
    const cloudflareConfigured = !!cfToken;

    return c.json({
      data: {
        docker: { available: dockerAvailable },
        cloudflare: { configured: cloudflareConfigured },
      },
      error: null,
    });
  });

  // Get all settings (except protected keys)
  app.get("/", (c) => {
    const db = c.get("db");
    const allSettings = db.select().from(settings).all();

    const result: Record<string, unknown> = {};
    for (const setting of allSettings) {
      if (!PROTECTED_KEYS.includes(setting.key)) {
        try {
          result[setting.key] = JSON.parse(setting.value);
        } catch {
          result[setting.key] = setting.value;
        }
      }
    }

    return c.json({ data: result, error: null });
  });

  // Set a setting
  app.put("/", async (c) => {
    const db = c.get("db");

    let body: { key?: string; value?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const key = body.key;
    if (!key || typeof key !== "string" || key.trim() === "") {
      return c.json({ data: null, error: "Key is required" }, 400);
    }

    if (PROTECTED_KEYS.includes(key)) {
      return c.json(
        { data: null, error: "Cannot modify protected setting" },
        400,
      );
    }

    const value = body.value;
    const now = new Date().toISOString();
    const valueStr = JSON.stringify(value);

    const existing = db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .get();

    if (existing) {
      db.update(settings)
        .set({ value: valueStr, updatedAt: now })
        .where(eq(settings.key, key))
        .run();
    } else {
      db.insert(settings)
        .values({
          key,
          value: valueStr,
          updatedAt: now,
        })
        .run();
    }

    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
