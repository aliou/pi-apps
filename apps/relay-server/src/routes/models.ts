import { getEnvApiKey, getModels, getProviders } from "@mariozechner/pi-ai";
import { Hono } from "hono";
import type { AppEnv } from "../app";

/**
 * Models API - returns available models based on configured secrets.
 *
 * Determines which providers have credentials by querying enabled secrets
 * with kind=ai_provider from the DB. Temporarily sets dummy env vars so
 * pi-ai's getEnvApiKey() returns truthy for those providers.
 *
 * This uses pi-ai's built-in provider list only. Custom providers from
 * extensions are not included. For the full list including extensions,
 * use get_available_models via RPC on an active session.
 */
export function modelsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const secretsService = c.get("secretsService");

    // Get env var names for enabled ai_provider secrets
    const configuredEnvVars =
      await secretsService.getEnabledEnvVarsByKind("ai_provider");

    // Temporarily set dummy values so getEnvApiKey() returns truthy
    const originalValues: Record<string, string | undefined> = {};
    for (const envVar of configuredEnvVars) {
      originalValues[envVar] = process.env[envVar];
      process.env[envVar] = "configured";
    }

    try {
      const availableModels = getProviders()
        .filter((provider) => getEnvApiKey(provider))
        .flatMap((provider) => getModels(provider));

      return c.json({ data: availableModels, error: null });
    } finally {
      // Restore original env values
      for (const envVar of configuredEnvVars) {
        if (originalValues[envVar] === undefined) {
          delete process.env[envVar];
        } else {
          process.env[envVar] = originalValues[envVar];
        }
      }
    }
  });

  return app;
}
