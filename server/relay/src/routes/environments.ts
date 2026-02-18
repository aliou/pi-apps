import { Hono } from "hono";
import type { AppEnv } from "../app";
import { createLogger } from "../lib/logger";
import type { EnvironmentSandboxConfig } from "../sandbox/manager";
import {
  AVAILABLE_DOCKER_IMAGES,
  type EnvironmentConfig,
  type SandboxType,
} from "../services/environment.service";

interface CreateEnvironmentRequest {
  name: string;
  sandboxType: SandboxType;
  config: EnvironmentConfig;
  isDefault?: boolean;
}

interface UpdateEnvironmentRequest {
  name?: string;
  sandboxType?: SandboxType;
  config?: EnvironmentConfig;
  isDefault?: boolean;
}

/**
 * Build an EnvironmentSandboxConfig from environment type + config.
 * For cloudflare, apiToken must be resolved separately from the secrets table.
 */
function toSandboxConfig(
  sandboxType: SandboxType,
  config: EnvironmentConfig,
  apiToken?: string,
): EnvironmentSandboxConfig {
  return {
    sandboxType,
    image: config.image,
    workerUrl: config.workerUrl,
    apiToken,
    imagePath: config.imagePath,
  };
}

/**
 * Validate environment config for a given sandbox type.
 * Returns error message or null if valid.
 */
function validateConfig(
  sandboxType: SandboxType,
  config: EnvironmentConfig,
): string | null {
  if (sandboxType === "docker") {
    if (!config.image) {
      return "config.image is required for docker environments";
    }
    // Validate image is in allowed list (ignore tag)
    const stripTag = (s: string) => s.replace(/:[\w.-]+$/, "");
    const validBases = AVAILABLE_DOCKER_IMAGES.map((img) =>
      stripTag(img.image),
    );
    if (!validBases.includes(stripTag(config.image))) {
      return `Invalid image. Must be one of: ${AVAILABLE_DOCKER_IMAGES.map((img) => img.image).join(", ")}`;
    }
  } else if (sandboxType === "cloudflare") {
    if (!config.workerUrl) {
      return "config.workerUrl is required for cloudflare environments";
    }
    try {
      new URL(config.workerUrl);
    } catch {
      return "config.workerUrl must be a valid URL";
    }
    if (!config.secretId) {
      return "config.secretId is required for cloudflare environments (shared secret for Worker auth)";
    }
  } else if (sandboxType === "gondolin") {
    if (
      config.imagePath !== undefined &&
      typeof config.imagePath !== "string"
    ) {
      return "config.imagePath must be a string when provided";
    }
  }

  // Validate idleTimeoutSeconds if provided
  if (config.idleTimeoutSeconds !== undefined) {
    if (
      !Number.isInteger(config.idleTimeoutSeconds) ||
      config.idleTimeoutSeconds < 60 ||
      config.idleTimeoutSeconds > 86400
    ) {
      return "config.idleTimeoutSeconds must be an integer between 60 and 86400";
    }
  }

  return null;
}

export function environmentsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger("environments");

  // List available Docker images (hardcoded)
  app.get("/images", (c) => {
    return c.json({ data: AVAILABLE_DOCKER_IMAGES, error: null });
  });

  // Probe provider availability for a given config
  app.post("/probe", async (c) => {
    const sandboxManager = c.get("sandboxManager");

    let body: { sandboxType: SandboxType; config: EnvironmentConfig };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const validTypes: SandboxType[] = ["docker", "cloudflare", "gondolin"];
    if (!body.sandboxType || !validTypes.includes(body.sandboxType)) {
      return c.json(
        {
          data: null,
          error: `sandboxType must be one of: ${validTypes.join(", ")}`,
        },
        400,
      );
    }

    const configError = validateConfig(body.sandboxType, body.config ?? {});
    if (configError) {
      return c.json({ data: null, error: configError }, 400);
    }

    try {
      // For cloudflare, resolve the shared secret from the secrets table
      let apiToken: string | undefined;
      if (body.sandboxType === "cloudflare" && body.config.secretId) {
        const secretsService = c.get("secretsService");
        const value = await secretsService.getValue(body.config.secretId);
        if (!value) {
          return c.json({
            data: { available: false, error: "Referenced secret not found" },
            error: null,
          });
        }
        apiToken = value;
      }

      const envConfig = toSandboxConfig(
        body.sandboxType,
        body.config,
        apiToken,
      );
      const available = await sandboxManager.isProviderAvailable(envConfig);
      return c.json({
        data: { available, sandboxType: body.sandboxType },
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Probe failed";
      return c.json({
        data: { available: false, error: message },
        error: null,
      });
    }
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

    const validSandboxTypes: SandboxType[] = [
      "docker",
      "cloudflare",
      "gondolin",
    ];
    if (!body.sandboxType || !validSandboxTypes.includes(body.sandboxType)) {
      return c.json(
        {
          data: null,
          error: `sandboxType must be one of: ${validSandboxTypes.join(", ")}`,
        },
        400,
      );
    }

    const configError = validateConfig(body.sandboxType, body.config ?? {});
    if (configError) {
      return c.json({ data: null, error: configError }, 400);
    }

    try {
      // Apply idleTimeoutSeconds defaults
      const configToStore = { ...body.config };
      if (body.sandboxType === "cloudflare") {
        // Cloudflare manages its own idle timeout; force default
        configToStore.idleTimeoutSeconds = 3600;
      } else if (configToStore.idleTimeoutSeconds === undefined) {
        configToStore.idleTimeoutSeconds = 3600;
      }

      const env = environmentService.create({
        name: body.name.trim(),
        sandboxType: body.sandboxType,
        config: configToStore,
        isDefault: body.isDefault,
      });

      return c.json({
        data: { ...env, config: JSON.parse(env.config) },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to create environment");
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

    // Use existing sandboxType if not provided in update
    const sandboxType =
      body.sandboxType ?? (existing.sandboxType as SandboxType);

    // Validate config if provided
    if (body.config) {
      const configError = validateConfig(sandboxType, body.config);
      if (configError) {
        return c.json({ data: null, error: configError }, 400);
      }
    }

    try {
      // Strip idleTimeoutSeconds changes for Cloudflare environments
      let configToUpdate = body.config;
      if (configToUpdate && sandboxType === "cloudflare") {
        const { idleTimeoutSeconds: _, ...rest } = configToUpdate;
        configToUpdate = rest;
      }

      environmentService.update(id, {
        name: body.name?.trim(),
        config: configToUpdate,
        isDefault: body.isDefault,
      });

      // biome-ignore lint/style/noNonNullAssertion: just validated existence
      const updated = environmentService.get(id)!;
      return c.json({
        data: { ...updated, config: JSON.parse(updated.config) },
        error: null,
      });
    } catch (err) {
      logger.error({ err, environmentId: id }, "failed to update environment");
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
