import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { createLogger } from "../lib/logger";
import { resolveEnvConfig } from "../sandbox/manager";
import type {
  IntrospectedModel,
  IntrospectionErrorReason,
} from "../services/models-introspection.service";
import { ModelsIntrospectionService } from "../services/models-introspection.service";
import type { SecretInfo } from "../services/secrets.service";

const log = createLogger("models");

type ModelSource = "introspected" | "fallback-cache" | "fallback-static";

type ApiModelInfo = IntrospectedModel & { id: string };

interface ModelsResponseData {
  models: ApiModelInfo[];
  source: ModelSource;
  degraded?: boolean;
  message?: string;
}

/**
 * Static fallback models - returned when Gondolin is unavailable and no cache exists.
 * These are the built-in Pi AI provider models.
 */
const STATIC_FALLBACK_MODELS: IntrospectedModel[] = [
  { provider: "pi-ai", modelId: "gpt-4o" },
  { provider: "pi-ai", modelId: "claude-3-5-sonnet" },
  { provider: "pi-ai", modelId: "gemini-1.5-pro" },
];

/**
 * Models API - returns available models via Pi RPC introspection.
 *
 * Spins up an ephemeral Gondolin sandbox, sends get_available_models to
 * the pi agent, and returns the result. This includes both built-in
 * provider models and extension-defined models.
 *
 * Results are cached and auto-invalidated when the fingerprint of
 * (extension packages + secret values) changes.
 *
 * When Gondolin is unavailable or introspection fails, falls back to:
 * 1. Last successful introspection (fallback-cache)
 * 2. Static built-in models (fallback-static)
 */
export function modelsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  let cachedFingerprint: string | null = null;
  let cachedModels: IntrospectedModel[] | null = null;
  let cachedIntrospection: IntrospectedModel[] | null = null;

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
    const secretsList = await secretsService.list();
    const secrets = await secretsService.getAllAsEnv();
    const fingerprint = computeFingerprint(packages, secrets, secretsList);
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
      return c.json(createResponse(cachedModels, "introspected", null));
    }

    log.info(
      { previousFingerprint: cachedFingerprint, newFingerprint: fingerprint },
      "cache miss, running introspection",
    );

    // Find a gondolin environment to use for introspection
    const allEnvs = environmentService.list();
    const gondolinEnv = allEnvs.find((e) => e.sandboxType === "gondolin");

    let result: ModelsResponseData;
    let error: string | null = null;

    if (!gondolinEnv) {
      // No Gondolin environment - try fallbacks
      log.warn("no gondolin environment configured, trying fallbacks");
      if (cachedIntrospection !== null) {
        log.info("using fallback cache (no Gondolin available)");
        result = createResponse(
          cachedIntrospection,
          "fallback-cache",
          "Gondolin not configured, using cached introspection",
          true,
        );
      } else {
        log.info("using static fallback (no Gondolin or cache available)");
        result = createResponse(
          STATIC_FALLBACK_MODELS,
          "fallback-static",
          "Gondolin not configured, using static built-in models",
          true,
        );
      }
    } else {
      const envConfig = await resolveEnvConfig(gondolinEnv, secretsService);

      const introspection = new ModelsIntrospectionService(
        sandboxManager,
        secretsService,
        extensionConfigService,
        sessionDataDir,
        envConfig,
      );

      const introspectionResult = await introspection.getModels();

      if (!introspectionResult.error) {
        // Successful introspection
        cachedFingerprint = fingerprint;
        cachedModels = introspectionResult.models;
        cachedIntrospection = introspectionResult.models;
        log.info(
          { modelCount: introspectionResult.models.length },
          "introspection succeeded",
        );
        result = createResponse(
          introspectionResult.models,
          "introspected",
          null,
        );
      } else {
        // Introspection failed - try fallbacks
        const reason =
          introspectionResult.errorReason as IntrospectionErrorReason;
        log.warn(
          { error: introspectionResult.error, reason },
          "introspection failed, trying fallbacks",
        );

        if (cachedIntrospection !== null) {
          log.info("using fallback cache (introspection failed)");
          result = createResponse(
            cachedIntrospection,
            "fallback-cache",
            `Introspection failed (${reason}), using cached introspection`,
            true,
          );
        } else {
          log.info(
            "using static fallback (introspection failed and no cache available)",
          );
          result = createResponse(
            STATIC_FALLBACK_MODELS,
            "fallback-static",
            `Introspection failed (${reason}), using static built-in models`,
            true,
          );
        }
        error = introspectionResult.error;
      }
    }

    return c.json({ data: result, error });
  });

  return app;
}

/**
 * Compute a fingerprint from the inputs that affect model availability.
 * Changes to extension packages, secret values, or domain metadata
 * produce a different hash.
 */
function computeFingerprint(
  packages: string[],
  secrets: Record<string, string>,
  secretsList?: SecretInfo[],
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

  // Domain metadata (sorted by envVar for stability)
  if (secretsList) {
    const sorted = [...secretsList].sort((a, b) =>
      a.envVar.localeCompare(b.envVar),
    );
    for (const s of sorted) {
      if (s.domains && s.domains.length > 0) {
        hash.update(`domains:${s.envVar}:${s.domains.sort().join(",")}\n`);
      }
    }
  }

  return hash.digest("hex");
}

/**
 * Create a models response with the given data and source.
 */
function createResponse(
  models: IntrospectedModel[],
  source: ModelSource,
  message: string | null,
  degraded = false,
): ModelsResponseData {
  const response: ModelsResponseData = {
    models: models.map((model) => ({ ...model, id: model.modelId })),
    source,
  };
  if (message) response.message = message;
  if (degraded) response.degraded = true;
  return response;
}
