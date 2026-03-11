import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { type Env as PinoEnv, pinoLogger } from "hono-pino";
import type { AppDatabase } from "./db/connection";
import { rootLogger, withRequestContext } from "./lib/logger";
import { environmentsRoutes } from "./routes/environments";
import { extensionConfigsRoutes } from "./routes/extension-configs";
import { githubRoutes } from "./routes/github";
import { healthRoutes } from "./routes/health";
import { metaRoutes } from "./routes/meta";
import { modelsRoutes } from "./routes/models";
import { packagesRoutes } from "./routes/packages";
import { secretsRoutes } from "./routes/secrets";
import { sessionsRoutes } from "./routes/sessions";
import { settingsRoutes } from "./routes/settings";
import type { SandboxLogStore } from "./sandbox/log-store";
import type { SandboxManager } from "./sandbox/manager";
import type { EnvironmentService } from "./services/environment.service";
import type { EventJournal } from "./services/event-journal";
import type { ExtensionConfigService } from "./services/extension-config.service";
import type { GitHubService } from "./services/github.service";
import type { GitHubAppService } from "./services/github-app.service";
import type { PackageCatalogService } from "./services/package-catalog.service";
import type { RepoService } from "./services/repo.service";
import type { SecretsService } from "./services/secrets.service";
import type { SessionService } from "./services/session.service";
import type { SessionHubManager } from "./ws/session-hub";

export type AppEnv = PinoEnv & {
  Variables: {
    db: AppDatabase;
    sessionService: SessionService;
    eventJournal: EventJournal;
    repoService: RepoService;
    githubService: GitHubService;
    githubAppService: GitHubAppService;
    sandboxManager: SandboxManager;
    secretsService: SecretsService;
    environmentService: EnvironmentService;
    extensionConfigService: ExtensionConfigService;
    sandboxLogStore: SandboxLogStore;
    sessionDataDir: string;
    sessionHubManager: SessionHubManager;
    packageCatalogService: PackageCatalogService;
  };
};

export interface AppServices {
  db: AppDatabase;
  sessionService: SessionService;
  eventJournal: EventJournal;
  repoService: RepoService;
  githubService: GitHubService;
  githubAppService: GitHubAppService;
  sandboxManager: SandboxManager;
  secretsService: SecretsService;
  environmentService: EnvironmentService;
  extensionConfigService: ExtensionConfigService;
  sandboxLogStore: SandboxLogStore;
  sessionDataDir: string;
  sessionHubManager: SessionHubManager;
  packageCatalogService: PackageCatalogService;
}

export interface CreateAppOptions {
  services: AppServices;
}

export function createApp(options: CreateAppOptions): Hono<AppEnv> {
  const { services } = options;
  const app = new Hono<AppEnv>();

  // Inject services into context
  app.use("*", async (c, next) => {
    c.set("db", services.db);
    c.set("sessionService", services.sessionService);
    c.set("eventJournal", services.eventJournal);
    c.set("repoService", services.repoService);
    c.set("githubService", services.githubService);
    c.set("githubAppService", services.githubAppService);
    c.set("sandboxManager", services.sandboxManager);
    c.set("secretsService", services.secretsService);
    c.set("environmentService", services.environmentService);
    c.set("extensionConfigService", services.extensionConfigService);
    c.set("sandboxLogStore", services.sandboxLogStore);
    c.set("sessionDataDir", services.sessionDataDir);
    c.set("sessionHubManager", services.sessionHubManager);
    c.set("packageCatalogService", services.packageCatalogService);
    await next();
  });

  app.use("*", requestId());
  app.use("*", async (c, next) => {
    await withRequestContext(c.get("requestId"), next);
  });
  app.use(
    "*",
    pinoLogger({
      pino: rootLogger,
      http: {
        referRequestIdKey: "requestId",
        onReqMessage: () => "request start",
        onResMessage: () => "request end",
        responseTime: true,
      },
    }),
  );
  app.use("*", cors());
  app.use("*", async (c, next) => {
    const startedAt = Date.now();
    await next();
    const logger = c.get("logger");
    const status = c.res.status;
    logger.info(
      {
        event: "request_summary",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs: Date.now() - startedAt,
        outcome:
          status >= 500 ? "error" : status >= 400 ? "client_error" : "success",
      },
      "request summary",
    );
  });

  // Error handler
  app.onError((err, c) => {
    const logger = c.get("logger");
    logger.error(
      {
        event: "request_error",
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        errorName: err instanceof Error ? err.name : "Error",
        errorMessage: err instanceof Error ? err.message : String(err),
        err,
      },
      "unhandled error",
    );
    return c.json({ data: null, error: "Internal server error" }, 500);
  });

  // Mount routes
  app.route("/", healthRoutes());
  app.route("/api/sessions", sessionsRoutes());
  app.route("/api/github", githubRoutes());
  app.route("/api/meta", metaRoutes());
  app.route("/api/models", modelsRoutes());
  app.route("/api/settings", settingsRoutes());
  app.route("/api/secrets", secretsRoutes(services.secretsService));
  app.route("/api/environments", environmentsRoutes());
  app.route("/api/extension-configs", extensionConfigsRoutes());
  app.route("/api/packages", packagesRoutes());

  return app;
}
