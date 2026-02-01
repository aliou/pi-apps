import { Hono } from "hono";
import type { AppEnv } from "../app";
import {
  AVAILABLE_DOCKER_IMAGES,
  type DockerEnvironmentConfig,
  type SandboxType,
} from "../services/environment.service";

interface CreateEnvironmentRequest {
  name: string;
  sandboxType: SandboxType;
  config: DockerEnvironmentConfig;
  isDefault?: boolean;
}

interface UpdateEnvironmentRequest {
  name?: string;
  config?: DockerEnvironmentConfig;
  isDefault?: boolean;
}

export function environmentsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List available Docker images (hardcoded)
  app.get("/images", (c) => {
    return c.json({ data: AVAILABLE_DOCKER_IMAGES, error: null });
  });

  // List all environments
  app.get("/", (c) => {
    const environmentService = c.get("environmentService");
    const envs = environmentService.list();

    // Parse config JSON for response
    const data = envs.map((env) => ({
      ...env,
      config: JSON.parse(env.config),
    }));

    return c.json({ data, error: null });
  });

  // Create new environment
  app.post("/", async (c) => {
    const environmentService = c.get("environmentService");

    let body: CreateEnvironmentRequest;
    try {
      body = await c.req.json<CreateEnvironmentRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    // Validate required fields
    if (!body.name?.trim()) {
      return c.json({ data: null, error: "name is required" }, 400);
    }

    if (!body.sandboxType || body.sandboxType !== "docker") {
      return c.json({ data: null, error: "sandboxType must be 'docker'" }, 400);
    }

    if (!body.config?.image) {
      return c.json({ data: null, error: "config.image is required" }, 400);
    }

    // Validate image is in allowed list
    const validImages: string[] = AVAILABLE_DOCKER_IMAGES.map(
      (img) => img.image,
    );
    if (!validImages.includes(body.config.image)) {
      return c.json(
        {
          data: null,
          error: `Invalid image. Must be one of: ${validImages.join(", ")}`,
        },
        400,
      );
    }

    try {
      const env = environmentService.create({
        name: body.name.trim(),
        sandboxType: body.sandboxType,
        config: body.config,
        isDefault: body.isDefault,
      });

      return c.json({
        data: { ...env, config: JSON.parse(env.config) },
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create environment";
      return c.json({ data: null, error: message }, 500);
    }
  });

  // Get single environment
  app.get("/:id", (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");
    const env = environmentService.get(id);

    if (!env) {
      return c.json({ data: null, error: "Environment not found" }, 404);
    }

    return c.json({
      data: { ...env, config: JSON.parse(env.config) },
      error: null,
    });
  });

  // Update environment
  app.put("/:id", async (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");

    const existing = environmentService.get(id);
    if (!existing) {
      return c.json({ data: null, error: "Environment not found" }, 404);
    }

    let body: UpdateEnvironmentRequest;
    try {
      body = await c.req.json<UpdateEnvironmentRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    // Validate image if provided
    if (body.config?.image) {
      const validImages: string[] = AVAILABLE_DOCKER_IMAGES.map(
        (img) => img.image,
      );
      if (!validImages.includes(body.config.image)) {
        return c.json(
          {
            data: null,
            error: `Invalid image. Must be one of: ${validImages.join(", ")}`,
          },
          400,
        );
      }
    }

    try {
      environmentService.update(id, {
        name: body.name?.trim(),
        config: body.config,
        isDefault: body.isDefault,
      });

      // biome-ignore lint/style/noNonNullAssertion: just validated existence
      const updated = environmentService.get(id)!;
      return c.json({
        data: { ...updated, config: JSON.parse(updated.config) },
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update environment";
      return c.json({ data: null, error: message }, 500);
    }
  });

  // Delete environment
  app.delete("/:id", (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");

    const existing = environmentService.get(id);
    if (!existing) {
      return c.json({ data: null, error: "Environment not found" }, 404);
    }

    // TODO: Check for active sessions using this environment
    environmentService.delete(id);
    return c.json({ data: { ok: true }, error: null });
  });

  return app;
}
