import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { SecretId, SecretsService } from "../services/secrets.service";

/**
 * Valid secret IDs that can be managed via the API.
 */
const VALID_SECRET_IDS: SecretId[] = [
  "anthropic_api_key",
  "openai_api_key",
  "gemini_api_key",
  "groq_api_key",
  "deepseek_api_key",
  "openrouter_api_key",
  "github_token",
];

function isValidSecretId(id: string): id is SecretId {
  return VALID_SECRET_IDS.includes(id as SecretId);
}

export function secretsRoutes(secretsService: SecretsService): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List all secrets (metadata only, no values)
  app.get("/", async (c) => {
    const list = await secretsService.list();
    return c.json({ data: list, error: null });
  });

  // Check if a specific secret exists
  app.get("/:id", async (c) => {
    const id = c.req.param("id");

    if (!isValidSecretId(id)) {
      return c.json({ data: null, error: "Invalid secret ID" }, 400);
    }

    const exists = await secretsService.has(id);
    return c.json({
      data: { id, configured: exists },
      error: null,
    });
  });

  // Set a secret
  app.put("/:id", async (c) => {
    const id = c.req.param("id");

    if (!isValidSecretId(id)) {
      return c.json({ data: null, error: "Invalid secret ID" }, 400);
    }

    let body: { value?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const { value } = body;
    if (typeof value !== "string" || value.trim() === "") {
      return c.json({ data: null, error: "Value is required" }, 400);
    }

    await secretsService.set(id, value.trim());

    return c.json({ data: { ok: true }, error: null });
  });

  // Delete a secret
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");

    if (!isValidSecretId(id)) {
      return c.json({ data: null, error: "Invalid secret ID" }, 400);
    }

    const deleted = await secretsService.delete(id);

    if (!deleted) {
      return c.json({ data: null, error: "Secret not found" }, 404);
    }

    return c.json({ data: { ok: true }, error: null });
  });

  // Get list of valid secret IDs
  app.get("/schema/ids", (c) => {
    return c.json({
      data: VALID_SECRET_IDS.map((id) => ({
        id,
        envVar: id.toUpperCase(),
        name: id
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      })),
      error: null,
    });
  });

  return app;
}
