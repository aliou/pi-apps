import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";

// Keys that should not be exposed via the general settings API
const PROTECTED_KEYS = ["github_repos_access_token", "github_app_config"];

interface ModelsIntrospectionSetting {
  environmentId?: string;
}

interface IdlePolicySetting {
  defaultTimeoutSeconds: number;
  graceAfterDisconnectSeconds: number;
  disableForModes?: Array<"chat" | "code">;
}

function validateSettingValue(key: string, value: unknown): string | null {
  if (key === "models_introspection") {
    if (!value || typeof value !== "object") {
      return "models_introspection must be an object";
    }

    const payload = value as ModelsIntrospectionSetting;
    if (
      payload.environmentId !== undefined &&
      (typeof payload.environmentId !== "string" ||
        payload.environmentId.trim() === "")
    ) {
      return "models_introspection.environmentId must be a non-empty string when provided";
    }

    return null;
  }

  if (key === "chat_mode_prompt_profile") {
    if (typeof value !== "string") {
      return "chat_mode_prompt_profile must be a string";
    }
  }

  if (key === "idle_policy") {
    if (!value || typeof value !== "object") {
      return "idle_policy must be an object";
    }

    const payload = value as IdlePolicySetting;
    if (
      !Number.isInteger(payload.defaultTimeoutSeconds) ||
      payload.defaultTimeoutSeconds <= 0
    ) {
      return "idle_policy.defaultTimeoutSeconds must be a positive integer";
    }

    if (
      !Number.isInteger(payload.graceAfterDisconnectSeconds) ||
      payload.graceAfterDisconnectSeconds < 0
    ) {
      return "idle_policy.graceAfterDisconnectSeconds must be a non-negative integer";
    }

    if (payload.disableForModes !== undefined) {
      if (!Array.isArray(payload.disableForModes)) {
        return "idle_policy.disableForModes must be an array when provided";
      }

      const invalidMode = payload.disableForModes.find(
        (mode) => mode !== "chat" && mode !== "code",
      );
      if (invalidMode) {
        return "idle_policy.disableForModes entries must be 'chat' or 'code'";
      }
    }
  }

  return null;
}

export function settingsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Get sandbox provider status
  app.get("/sandbox-providers", async (c) => {
    const sandboxManager = c.get("sandboxManager");

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

    // Check Gondolin availability
    let gondolinAvailable = false;
    try {
      gondolinAvailable = await sandboxManager.isProviderAvailable({
        sandboxType: "gondolin",
      });
    } catch {
      // Gondolin not available
    }

    return c.json({
      data: {
        docker: { available: dockerAvailable },
        gondolin: { available: gondolinAvailable },
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
    const validationError = validateSettingValue(key, value);
    if (validationError) {
      return c.json({ data: null, error: validationError }, 400);
    }

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
