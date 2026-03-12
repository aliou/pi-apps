import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { settings } from "../db/schema";
import { resolveEnvConfig } from "../sandbox/manager";
import type {
  IntrospectedModel,
  IntrospectionErrorReason,
} from "../services/models-introspection.service";
import { ModelsIntrospectionService } from "../services/models-introspection.service";
import type { SecretInfo } from "../services/secrets.service";

type ModelSource =
  | "configured-environment"
  | "fallback-environment"
  | "fallback-cache"
  | "unavailable";

type ApiModelInfo = IntrospectedModel;

type IntrospectionSource = Extract<
  ModelSource,
  "configured-environment" | "fallback-environment"
>;

interface ModelsResponseData {
  models: ApiModelInfo[];
  source: ModelSource;
  environmentId?: string;
  degraded?: boolean;
  message?: string;
}

interface ModelsIntrospectionSetting {
  environmentId?: string;
}

interface IntrospectionCandidate {
  source: IntrospectionSource;
  environmentId: string;
}

/**
 * Models API - returns available models via Pi RPC introspection.
 *
 * Uses a configured introspection environment when available, otherwise falls
 * back to default/other configured environments. If all providers fail,
 * returns cached introspection when available, otherwise an empty degraded
 * response with detailed errors.
 */
export function modelsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  let cachedFingerprint: string | null = null;
  let cachedModels: IntrospectedModel[] | null = null;
  let cachedSource: IntrospectionSource | null = null;
  let cachedEnvironmentId: string | undefined;
  let cachedIntrospection: IntrospectedModel[] | null = null;
  let cachedIntrospectionEnvironmentId: string | undefined;

  const clearCaches = () => {
    cachedFingerprint = null;
    cachedModels = null;
    cachedSource = null;
    cachedEnvironmentId = undefined;
    cachedIntrospection = null;
    cachedIntrospectionEnvironmentId = undefined;
  };

  app.post("/refresh", (c) => {
    const logger = c.get("logger");
    clearCaches();
    logger.info("models cache cleared via refresh endpoint");
    return c.json({ data: { ok: true }, error: null });
  });

  app.get("/", async (c) => {
    const logger = c.get("logger");
    const db = c.get("db");
    const sandboxManager = c.get("sandboxManager");
    const secretsService = c.get("secretsService");
    const extensionConfigService = c.get("extensionConfigService");
    const environmentService = c.get("environmentService");
    const sessionDataDir = c.get("sessionDataDir");

    const allEnvs = environmentService.list();
    const packages = extensionConfigService.getResolvedPackages(
      "_introspect",
      "code",
    );
    const secretsList = await secretsService.list();
    const secrets = await secretsService.getAllAsEnv();
    const fingerprint = computeFingerprint(
      packages,
      secrets,
      secretsList,
      allEnvs,
    );

    logger.debug(
      {
        fingerprint,
        packageCount: packages.length,
        secretCount: Object.keys(secrets).length,
      },
      "computed fingerprint",
    );

    if (
      cachedFingerprint === fingerprint &&
      cachedModels !== null &&
      cachedSource !== null
    ) {
      logger.debug(
        { source: cachedSource, environmentId: cachedEnvironmentId },
        "returning cached models",
      );
      return c.json({
        data: createResponse(
          cachedModels,
          cachedSource,
          null,
          false,
          cachedEnvironmentId,
        ),
        error: null,
      });
    }

    const introspectionSetting = getIntrospectionSetting(db);
    const candidates = buildIntrospectionCandidates(
      allEnvs,
      introspectionSetting.environmentId,
      logger,
    );

    const errors: string[] = [];

    for (const candidate of candidates) {
      const env = environmentService.get(candidate.environmentId);
      if (!env) {
        logger.warn(
          {
            environmentId: candidate.environmentId,
            source: candidate.source,
          },
          "introspection environment no longer exists, skipping",
        );
        continue;
      }

      const envConfig = await resolveEnvConfig(env, secretsService);
      const providerAvailable =
        await sandboxManager.isProviderAvailable(envConfig);

      if (!providerAvailable) {
        logger.warn(
          {
            environmentId: env.id,
            provider: env.sandboxType,
            source: candidate.source,
          },
          "provider unavailable for introspection candidate, trying next",
        );
        errors.push(`${env.id} (${env.sandboxType}): provider_unavailable`);
        continue;
      }

      logger.info(
        {
          environmentId: env.id,
          provider: env.sandboxType,
          source: candidate.source,
        },
        "running model introspection",
      );

      const introspection = new ModelsIntrospectionService(
        sandboxManager,
        extensionConfigService,
        sessionDataDir,
        envConfig,
      );

      const introspectionResult = await introspection.getModels();

      if (!introspectionResult.error) {
        cachedFingerprint = fingerprint;
        cachedModels = introspectionResult.models;
        cachedSource = candidate.source;
        cachedEnvironmentId = env.id;
        cachedIntrospection = introspectionResult.models;
        cachedIntrospectionEnvironmentId = env.id;

        logger.info(
          {
            environmentId: env.id,
            provider: env.sandboxType,
            source: candidate.source,
            modelCount: introspectionResult.models.length,
          },
          "introspection succeeded",
        );

        return c.json({
          data: createResponse(
            introspectionResult.models,
            candidate.source,
            null,
            false,
            env.id,
          ),
          error: null,
        });
      }

      const reason = introspectionResult.errorReason as
        | IntrospectionErrorReason
        | undefined;
      const reasonText = reason ?? "unknown";
      errors.push(
        `${env.id} (${env.sandboxType}): ${reasonText} - ${introspectionResult.error}`,
      );

      logger.warn(
        {
          environmentId: env.id,
          provider: env.sandboxType,
          source: candidate.source,
          error: introspectionResult.error,
          reason,
        },
        "introspection candidate failed, trying next",
      );
    }

    if (cachedIntrospection !== null) {
      logger.info(
        {
          errorCount: errors.length,
          environmentId: cachedIntrospectionEnvironmentId,
        },
        "all introspection candidates failed, using fallback cache",
      );
      return c.json({
        data: createResponse(
          cachedIntrospection,
          "fallback-cache",
          "Introspection unavailable, using last successful introspection",
          true,
          cachedIntrospectionEnvironmentId,
        ),
        error: errors.length > 0 ? errors.join(" | ") : null,
      });
    }

    logger.warn(
      { errorCount: errors.length },
      "all introspection candidates failed, no cached introspection available",
    );
    return c.json({
      data: createResponse(
        [],
        "unavailable",
        "Model introspection unavailable. Configure a working introspection environment and refresh models.",
        true,
      ),
      error:
        errors.length > 0
          ? errors.join(" | ")
          : "model introspection unavailable",
    });
  });

  return app;
}

function getIntrospectionSetting(
  db: AppEnv["Variables"]["db"],
): ModelsIntrospectionSetting {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "models_introspection"))
    .get();

  if (!row) {
    return {};
  }

  try {
    const value = JSON.parse(row.value) as ModelsIntrospectionSetting;
    if (
      value &&
      typeof value === "object" &&
      (value.environmentId === undefined ||
        typeof value.environmentId === "string")
    ) {
      return value;
    }
    return {};
  } catch {
    return {};
  }
}

function buildIntrospectionCandidates(
  allEnvs: Array<{ id: string; isDefault: boolean }>,
  configuredEnvironmentId: string | undefined,
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void },
): IntrospectionCandidate[] {
  const byId = new Map(allEnvs.map((env) => [env.id, env]));
  const usedIds = new Set<string>();
  const candidates: IntrospectionCandidate[] = [];

  if (configuredEnvironmentId) {
    if (byId.has(configuredEnvironmentId)) {
      candidates.push({
        source: "configured-environment",
        environmentId: configuredEnvironmentId,
      });
      usedIds.add(configuredEnvironmentId);
    } else {
      logger.warn(
        { configuredEnvironmentId },
        "configured introspection environment missing",
      );
    }
  }

  const defaultEnv = allEnvs.find((env) => env.isDefault);
  if (defaultEnv && !usedIds.has(defaultEnv.id)) {
    candidates.push({
      source: "fallback-environment",
      environmentId: defaultEnv.id,
    });
    usedIds.add(defaultEnv.id);
  }

  for (const env of allEnvs) {
    if (!usedIds.has(env.id)) {
      candidates.push({
        source: "fallback-environment",
        environmentId: env.id,
      });
      usedIds.add(env.id);
    }
  }

  return candidates;
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
  environments?: Array<{
    id: string;
    sandboxType: string;
    isDefault: boolean;
    config: string;
    updatedAt: string;
  }>,
): string {
  const hash = createHash("sha256");

  for (const pkg of [...packages].sort()) {
    hash.update(`pkg:${pkg}\n`);
  }

  const sortedEntries = Object.entries(secrets).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [name, value] of sortedEntries) {
    hash.update(`secret:${name}:${value}\n`);
  }

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

  if (environments) {
    const sorted = [...environments].sort((a, b) => a.id.localeCompare(b.id));
    for (const env of sorted) {
      hash.update(
        `env:${env.id}:${env.sandboxType}:${env.isDefault ? "default" : "non-default"}:${env.config}:${env.updatedAt}\n`,
      );
    }
  }

  return hash.digest("hex");
}

function createResponse(
  models: IntrospectedModel[],
  source: ModelSource,
  message: string | null,
  degraded = false,
  environmentId?: string,
): ModelsResponseData {
  const response: ModelsResponseData = {
    models,
    source,
  };

  if (environmentId) {
    response.environmentId = environmentId;
  }
  if (message) {
    response.message = message;
  }
  if (degraded) {
    response.degraded = true;
  }

  return response;
}
