import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { createLogger } from "../lib/logger";
import { resolveEnvConfig } from "../sandbox/manager";
import type { IntrospectedModel } from "../services/models-introspection.service";
import { ModelsIntrospectionService } from "../services/models-introspection.service";

const log = createLogger("models");

/**
 * Models API - returns available models via Pi RPC introspection.
 *
 * Spins up an ephemeral Gondolin sandbox, sends get_available_models to
 * the pi agent, and returns the result. This includes both built-in
 * provider models and extension-defined models.
 *
 * Results are cached and auto-invalidated when the fingerprint of
 * (extension packages + secret values) changes.
 */
export function modelsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  let cachedFingerprint: string | null = null;
  let cachedModels: IntrospectedModel[] | null = null;

  app.get("/", async (c) => {
    const sandboxManager = c.get("sandboxManager");
    const secretsService = c.get("secretsService");
    const extensionConfigService = c.get("extensionConfigService");
    const environmentService = c.get("environmentService");
    const sessionDataDir = c.get("sessionDataDir");

    // Compute fingerprint from current state
    const packages = extensionConfigService.getResolvedPackages(
      "_introspect",
      "code",
    );
    const secrets = await secretsService.getAllAsEnv();
    const fingerprint = computeFingerprint(packages, secrets);
    log.debug(
      {
        fingerprint,
        packageCount: packages.length,
        secretCount: Object.keys(secrets).length,
      },
      "computed fingerprint",
    );

    // Return cached result if fingerprint matches
    if (cachedFingerprint === fingerprint && cachedModels !== null) {
      log.debug("returning cached models");
      return c.json({ data: cachedModels, error: null });
    }

    log.info(
      { previousFingerprint: cachedFingerprint, newFingerprint: fingerprint },
      "cache miss, running introspection",
    );

    // Find a gondolin environment to use for introspection
    const allEnvs = environmentService.list();
    const gondolinEnv = allEnvs.find((e) => e.sandboxType === "gondolin");
    if (!gondolinEnv) {
      return c.json(
        {
          data: [],
          error:
            "No gondolin environment configured. Required for full model introspection.",
        },
        500,
      );
    }

    const envConfig = await resolveEnvConfig(gondolinEnv, secretsService);

    const introspection = new ModelsIntrospectionService(
      sandboxManager,
      secretsService,
      extensionConfigService,
      sessionDataDir,
      envConfig,
    );

    const result = await introspection.getModels();

    // Only cache successful results
    if (!result.error) {
      cachedFingerprint = fingerprint;
      cachedModels = result.models;
    }

    if (result.error) {
      return c.json({ data: result.models, error: result.error });
    }

    return c.json({ data: result.models, error: null });
  });

  return app;
}

/**
 * Compute a fingerprint from the inputs that affect model availability.
 * Changes to extension packages or secret values produce a different hash.
 */
function computeFingerprint(
  packages: string[],
  secrets: Record<string, string>,
): string {
  const hash = createHash("sha256");

  // Extension packages (sorted for stability)
  for (const pkg of [...packages].sort()) {
    hash.update(`pkg:${pkg}\n`);
  }

  // Secret env var names + values (sorted by name for stability)
  const sortedEntries = Object.entries(secrets).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [name, value] of sortedEntries) {
    hash.update(`secret:${name}:${value}\n`);
  }

  return hash.digest("hex");
}
