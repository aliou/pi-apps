import { Hono } from "hono";
import type { AppEnv } from "../app";
import { createLogger } from "../lib/logger";
import type { SecretKind, SecretsService } from "../services/secrets.service";

export function secretsRoutes(secretsService: SecretsService): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger("secrets");

  // List all secrets (metadata only, no values)
  app.get("/", async (c) => {
    const list = await secretsService.list();
    return c.json({ data: list, error: null });
  });

  // Create a new secret
  app.post("/", async (c) => {
    let body: {
      name?: string;
      envVar?: string;
      kind?: string;
      value?: string;
      enabled?: boolean;
      domains?: string[];
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const { name, envVar, kind, value, enabled, domains } = body;

    if (typeof name !== "string" || name.trim() === "") {
      return c.json({ data: null, error: "name is required" }, 400);
    }
    if (typeof envVar !== "string" || envVar.trim() === "") {
      return c.json({ data: null, error: "envVar is required" }, 400);
    }
    if (typeof value !== "string" || value.trim() === "") {
      return c.json({ data: null, error: "value is required" }, 400);
    }
    const validKinds = ["ai_provider", "env_var", "sandbox_provider"];
    if (kind !== undefined && !validKinds.includes(kind)) {
      return c.json(
        {
          data: null,
          error: `kind must be one of: ${validKinds.join(", ")}`,
        },
        400,
      );
    }

    try {
      const secret = await secretsService.create({
        name: name.trim(),
        envVar,
        kind: (kind as SecretKind) ?? "env_var",
        value,
        enabled,
        domains,
      });

      return c.json({ data: secret, error: null }, 201);
    } catch (err) {
      logger.error({ err }, "failed to create secret");
      const msg = err instanceof Error ? err.message : "Unknown error";
      // SQLite unique constraint on env_var
      if (msg.includes("UNIQUE constraint")) {
        return c.json(
          {
            data: null,
            error: `A secret with envVar '${envVar}' already exists`,
          },
          400,
        );
      }
      // envVar validation errors
      if (msg.startsWith("envVar")) {
        return c.json({ data: null, error: msg }, 400);
      }
      // domain validation errors
      if (msg.startsWith("Domain pattern")) {
        return c.json({ data: null, error: msg }, 400);
      }
      throw err;
    }
  });

  // Update an existing secret
  app.put("/:id", async (c) => {
    const id = c.req.param("id");

    let body: {
      name?: string;
      envVar?: string;
      kind?: string;
      enabled?: boolean;
      value?: string;
      domains?: string[];
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const validKinds = ["ai_provider", "env_var", "sandbox_provider"];
    if (body.kind !== undefined && !validKinds.includes(body.kind)) {
      return c.json(
        {
          data: null,
          error: `kind must be one of: ${validKinds.join(", ")}`,
        },
        400,
      );
    }

    try {
      const updated = await secretsService.update(id, {
        name: body.name,
        envVar: body.envVar,
        kind: body.kind as SecretKind | undefined,
        enabled: body.enabled,
        value: body.value,
        domains: body.domains,
      });

      if (!updated) {
        return c.json({ data: null, error: "Secret not found" }, 404);
      }

      return c.json({ data: { ok: true }, error: null });
    } catch (err) {
      logger.error({ err, secretId: id }, "failed to update secret");
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("UNIQUE constraint")) {
        return c.json(
          {
            data: null,
            error: `A secret with envVar '${body.envVar}' already exists`,
          },
          400,
        );
      }
      if (msg.startsWith("envVar")) {
        return c.json({ data: null, error: msg }, 400);
      }
      if (msg.startsWith("Domain pattern")) {
        return c.json({ data: null, error: msg }, 400);
      }
      throw err;
    }
  });

  // Delete a secret
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await secretsService.delete(id);

    if (!deleted) {
      return c.json({ data: null, error: "Secret not found" }, 404);
    }

    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
