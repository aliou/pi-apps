import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { ExtensionScope } from "../services/extension-config.service";

function hasGondolinEnvironment(environmentService: {
  list: () => Array<{ sandboxType: string }>;
}): boolean {
  const allEnvs = environmentService.list();
  return allEnvs.some((e) => e.sandboxType === "gondolin");
}

const VALID_SCOPES: ExtensionScope[] = ["global", "chat", "code", "session"];

interface AddPackageRequest {
  scope: ExtensionScope;
  package: string;
  sessionId?: string;
  validate?: boolean;
  ignoreScripts?: boolean;
  config?: Record<string, unknown>;
}

interface UpdatePackageRequest {
  config?: Record<string, unknown>;
  validate?: boolean;
}

export function extensionConfigsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const extensionManifestService = c.get("packageCatalogService").manifestService;

    const scope = c.req.query("scope") as ExtensionScope | undefined;
    const sessionId = c.req.query("sessionId");

    if (!scope || !VALID_SCOPES.includes(scope)) {
      return c.json(
        {
          data: null,
          error: `scope query param required, must be one of: ${VALID_SCOPES.join(", ")}`,
        },
        400,
      );
    }

    if (scope === "session" && !sessionId) {
      return c.json(
        {
          data: null,
          error: "sessionId query param required for session scope",
        },
        400,
      );
    }

    const configs = extensionConfigService.listByScope(scope, sessionId);
    const data = await Promise.all(
      configs.map(async (config) => ({
        ...config,
        manifest: await extensionManifestService.getManifest(config.package),
      })),
    );

    return c.json({ data, error: null });
  });

  app.get("/resolved/:sessionId", (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const sessionService = c.get("sessionService");
    const sessionId = c.req.param("sessionId");

    const session = sessionService.get(sessionId);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    const packages = extensionConfigService.getResolvedPackageEntries(
      sessionId,
      session.mode as "chat" | "code",
    );

    return c.json({ data: { packages }, error: null });
  });

  app.post("/validation/cancel", (c) => {
    const sandboxManager = c.get("sandboxManager");
    const canceled = sandboxManager.cancelExtensionValidation();
    return c.json({ data: { canceled }, error: null });
  });

  app.post("/", async (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const extensionManifestService = c.get("packageCatalogService").manifestService;
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");
    const environmentService = c.get("environmentService");

    let body: AddPackageRequest;
    try {
      body = await c.req.json<AddPackageRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const scopeError = validateScopeAndSession(body.scope, body.sessionId, sessionService);
    if (scopeError) return scopeError;

    if (!body.package || typeof body.package !== "string" || !body.package.trim()) {
      return c.json({ data: null, error: "package is required" }, 400);
    }

    const pkg = body.package.trim();
    const manifest = await extensionManifestService.getManifest(pkg);
    const configValidation = extensionConfigService.validateConfig(body.config, manifest);
    if (!configValidation.valid) {
      return c.json(
        { data: null, error: "Invalid config values", meta: { fieldErrors: configValidation.errors } },
        400,
      );
    }

    const shouldValidate = body.validate !== false;
    let validation: { valid: boolean; error?: string } | null = null;
    if (shouldValidate) {
      if (!hasGondolinEnvironment(environmentService)) {
        validation = null;
      } else {
        validation = await sandboxManager.validateExtensionPackage(pkg, {
          ignoreScripts: body.ignoreScripts,
        });
        if (validation && !validation.valid) {
          return c.json(
            {
              data: null,
              error: `package validation failed: ${validation.error ?? "unknown error"}`,
            },
            400,
          );
        }
      }
    }

    const config = extensionConfigService.add({
      scope: body.scope,
      package: pkg,
      sessionId: body.scope === "session" ? body.sessionId : undefined,
      config: body.config,
    });

    const staleSessionIds = getAffectedSessionIds(sessionService, body.scope, body.sessionId);
    for (const sid of staleSessionIds) {
      sessionService.update(sid, { extensionsStale: true });
    }

    const meta: Record<string, unknown> = {
      staleSessionCount: staleSessionIds.length,
      validationSkipped: validation === null,
      manifestMissing: manifest === null,
    };

    return c.json({
      data: {
        ...config,
        manifest,
      },
      error: null,
      meta,
    });
  });

  app.put("/:id", async (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const extensionManifestService = c.get("packageCatalogService").manifestService;
    const sessionService = c.get("sessionService");
    const id = c.req.param("id");
    const existing = extensionConfigService.get(id);

    if (!existing) {
      return c.json({ data: null, error: "Extension config not found" }, 404);
    }

    let body: UpdatePackageRequest;
    try {
      body = await c.req.json<UpdatePackageRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const manifest = await extensionManifestService.getManifest(existing.package);
    const configValidation = extensionConfigService.validateConfig(body.config, manifest);
    if (!configValidation.valid) {
      return c.json(
        { data: null, error: "Invalid config values", meta: { fieldErrors: configValidation.errors } },
        400,
      );
    }

    const updated = extensionConfigService.update(id, { config: body.config ?? {} });
    if (!updated) {
      return c.json({ data: null, error: "Extension config not found" }, 404);
    }

    const staleSessionIds = getAffectedSessionIds(
      sessionService,
      existing.scope as ExtensionScope,
      existing.sessionId ?? undefined,
    );
    for (const sid of staleSessionIds) {
      sessionService.update(sid, { extensionsStale: true });
    }

    return c.json({
      data: {
        ...updated,
        manifest,
      },
      error: null,
      meta: {
        staleSessionCount: staleSessionIds.length,
      },
    });
  });

  app.delete("/:id", (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const sessionService = c.get("sessionService");
    const id = c.req.param("id");

    const existing = extensionConfigService.get(id);
    if (!existing) {
      return c.json({ data: null, error: "Extension config not found" }, 404);
    }

    const staleSessionIds = getAffectedSessionIds(
      sessionService,
      existing.scope as ExtensionScope,
      existing.sessionId ?? undefined,
    );
    for (const sid of staleSessionIds) {
      sessionService.update(sid, { extensionsStale: true });
    }

    extensionConfigService.remove(id);

    return c.json({
      data: { ok: true },
      error: null,
      ...(staleSessionIds.length > 0 && {
        meta: { staleSessionCount: staleSessionIds.length },
      }),
    });
  });

  return app;
}

function validateScopeAndSession(
  scope: ExtensionScope | undefined,
  sessionId: string | undefined,
  sessionService: { get: (id: string) => { id: string } | undefined },
) {
  if (!scope || !VALID_SCOPES.includes(scope)) {
    return new Response(
      JSON.stringify({
        data: null,
        error: `scope must be one of: ${VALID_SCOPES.join(", ")}`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (scope === "session") {
    if (!sessionId) {
      return new Response(
        JSON.stringify({
          data: null,
          error: "sessionId is required for session scope",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const session = sessionService.get(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ data: null, error: "Session not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  return null;
}

function getAffectedSessionIds(
  sessionService: {
    listActiveSessions: () => Array<{ id: string; mode: string }>;
  },
  scope: ExtensionScope,
  sessionId?: string,
): string[] {
  if (scope === "session" && sessionId) {
    const sessions = sessionService.listActiveSessions();
    return sessions.filter((s) => s.id === sessionId).map((s) => s.id);
  }

  const activeSessions = sessionService.listActiveSessions();

  if (scope === "global") {
    return activeSessions.map((s) => s.id);
  }

  return activeSessions.filter((s) => s.mode === scope).map((s) => s.id);
}
