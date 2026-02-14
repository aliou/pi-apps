import { Hono } from "hono";
import type { AppEnv } from "../app";
import type { ExtensionScope } from "../services/extension-config.service";

const VALID_SCOPES: ExtensionScope[] = ["global", "chat", "code", "session"];

interface AddPackageRequest {
  scope: ExtensionScope;
  package: string;
  sessionId?: string;
  validate?: boolean;
}

export function extensionConfigsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // List extension packages for a scope
  app.get("/", (c) => {
    const extensionConfigService = c.get("extensionConfigService");

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
    return c.json({ data: configs, error: null });
  });

  // Get resolved packages for a session (merged global + mode + session)
  app.get("/resolved/:sessionId", (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const sessionService = c.get("sessionService");
    const sessionId = c.req.param("sessionId");

    const session = sessionService.get(sessionId);
    if (!session) {
      return c.json({ data: null, error: "Session not found" }, 404);
    }

    const packages = extensionConfigService.getResolvedPackages(
      sessionId,
      session.mode as "chat" | "code",
    );

    return c.json({ data: { packages }, error: null });
  });

  // Cancel an in-flight extension validation.
  app.post("/validation/cancel", (c) => {
    const sandboxManager = c.get("sandboxManager");
    const canceled = sandboxManager.cancelExtensionValidation();
    return c.json({ data: { canceled }, error: null });
  });

  // Add a package
  app.post("/", async (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const sessionService = c.get("sessionService");
    const sandboxManager = c.get("sandboxManager");

    let body: AddPackageRequest;
    try {
      body = await c.req.json<AddPackageRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (!body.scope || !VALID_SCOPES.includes(body.scope)) {
      return c.json(
        {
          data: null,
          error: `scope must be one of: ${VALID_SCOPES.join(", ")}`,
        },
        400,
      );
    }

    if (
      !body.package ||
      typeof body.package !== "string" ||
      !body.package.trim()
    ) {
      return c.json({ data: null, error: "package is required" }, 400);
    }

    if (body.scope === "session") {
      if (!body.sessionId) {
        return c.json(
          { data: null, error: "sessionId is required for session scope" },
          400,
        );
      }
      const session = sessionService.get(body.sessionId);
      if (!session) {
        return c.json({ data: null, error: "Session not found" }, 404);
      }
    }

    // Validate package by installing in an ephemeral Gondolin VM.
    // If Gondolin is unavailable, skip validation (result is null).
    const pkg = body.package.trim();
    const shouldValidate = body.validate !== false;
    // console.log(
    //   `[ext-configs] package=${pkg} scope=${body.scope} sessionId=${body.sessionId ?? "-"} validate=${shouldValidate}`,
    // );

    let validation: { valid: boolean; error?: string } | null = null;
    if (shouldValidate) {
      validation = await sandboxManager.validateExtensionPackage(pkg);
      // console.log(
      //   `[ext-configs] validation result=${JSON.stringify(validation)} elapsedMs=${Date.now() - startedAt}`,
      // );
      if (validation && !validation.valid) {
        // console.log(
        //   `[ext-configs] reject package=${pkg} reason=${validation.error ?? "unknown error"}`,
        // );
        return c.json(
          {
            data: null,
            error: `package validation failed: ${validation.error ?? "unknown error"}`,
          },
          400,
        );
      }
    } else {
      // console.log(`[ext-configs] validation skipped by request package=${pkg}`);
    }

    const config = extensionConfigService.add({
      scope: body.scope,
      package: pkg,
      sessionId: body.scope === "session" ? body.sessionId : undefined,
    });

    // Mark affected active sessions as stale
    const staleSessionIds = getAffectedSessionIds(
      sessionService,
      body.scope,
      body.sessionId,
    );
    for (const sid of staleSessionIds) {
      sessionService.update(sid, { extensionsStale: true });
    }

    const meta: { staleSessionCount?: number; validationSkipped?: boolean } = {};
    if (staleSessionIds.length > 0) {
      meta.staleSessionCount = staleSessionIds.length;
    }
    if (validation === null) {
      meta.validationSkipped = true;
    }

    return c.json({
      data: config,
      error: null,
      ...(Object.keys(meta).length > 0 && { meta }),
    });
  });

  // Remove a package
  app.delete("/:id", (c) => {
    const extensionConfigService = c.get("extensionConfigService");
    const sessionService = c.get("sessionService");
    const id = c.req.param("id");

    const existing = extensionConfigService.get(id);
    if (!existing) {
      return c.json({ data: null, error: "Extension config not found" }, 404);
    }

    // Mark affected sessions stale before deleting
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

/**
 * Determine which active sessions are affected by a config change.
 */
function getAffectedSessionIds(
  sessionService: {
    listActiveSessions: () => Array<{ id: string; mode: string }>;
  },
  scope: ExtensionScope,
  sessionId?: string,
): string[] {
  if (scope === "session" && sessionId) {
    // Only the specific session
    const sessions = sessionService.listActiveSessions();
    return sessions.filter((s) => s.id === sessionId).map((s) => s.id);
  }

  const activeSessions = sessionService.listActiveSessions();

  if (scope === "global") {
    return activeSessions.map((s) => s.id);
  }

  // Mode scope: only sessions with matching mode
  return activeSessions.filter((s) => s.mode === scope).map((s) => s.id);
}
