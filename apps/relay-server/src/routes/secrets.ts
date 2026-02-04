import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { SandboxManager } from "../sandbox/manager";
import type { SecretKind, SecretsService } from "../services/secrets.service";

export function secretsRoutes(
  secretsService: SecretsService,
  sandboxManager: SandboxManager,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /**
   * Refresh the sandbox manager's secrets snapshot after a mutation.
   * Only affects future sandbox creations, not running containers.
   */
  async function refreshSecrets(): Promise<void> {
    const env = await secretsService.getAllAsEnv();
    sandboxManager.setSecrets(env);
  }

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
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const { name, envVar, kind, value, enabled } = body;

    if (typeof name !== "string" || name.trim() === "") {
      return c.json({ data: null, error: "name is required" }, 400);
    }
    if (typeof envVar !== "string" || envVar.trim() === "") {
      return c.json({ data: null, error: "envVar is required" }, 400);
    }
    if (typeof value !== "string" || value.trim() === "") {
      return c.json({ data: null, error: "value is required" }, 400);
    }
    if (kind !== undefined && kind !== "ai_provider" && kind !== "env_var") {
      return c.json(
        { data: null, error: "kind must be 'ai_provider' or 'env_var'" },
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
      });

      await refreshSecrets();
      return c.json({ data: secret, error: null }, 201);
    } catch (err) {
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
    };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (
      body.kind !== undefined &&
      body.kind !== "ai_provider" &&
      body.kind !== "env_var"
    ) {
      return c.json(
        { data: null, error: "kind must be 'ai_provider' or 'env_var'" },
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
      });

      if (!updated) {
        return c.json({ data: null, error: "Secret not found" }, 404);
      }

      await refreshSecrets();
      return c.json({ data: { ok: true }, error: null });
    } catch (err) {
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

    await refreshSecrets();
    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
