import { getEnvApiKey, getModels, getProviders } from "@mariozechner/pi-ai";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { SECRET_ENV_MAP } from "../services/secrets.service";

/**
 * Models API - returns available models based on configured secrets.
 *
 * This uses pi-ai's built-in provider list only. Custom providers from
 * extensions are not included. For the full list including extensions,
 * use get_available_models via RPC on an active session.
 */
export function modelsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const secretsService = c.get("secretsService");
    const configuredSecrets = await secretsService.list();

    // Get env var names for configured secrets
    const configuredEnvVars = new Set<string>();
    for (const secret of configuredSecrets) {
      const envVar = SECRET_ENV_MAP[secret.id];
      if (envVar) {
        configuredEnvVars.add(envVar);
      }
    }

    // Temporarily set dummy values for configured env vars
    // so getEnvApiKey() returns truthy for those providers
    const originalValues: Record<string, string | undefined> = {};
    for (const envVar of configuredEnvVars) {
      originalValues[envVar] = process.env[envVar];
      process.env[envVar] = "configured";
    }

    try {
      // Get models for providers that have credentials
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
