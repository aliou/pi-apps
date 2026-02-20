import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { type Env as PinoEnv, pinoLogger } from "hono-pino";
import type { AppDatabase } from "./db/connection";
import { rootLogger } from "./lib/logger";
import { environmentsRoutes } from "./routes/environments";
import { extensionConfigsRoutes } from "./routes/extension-configs";
import { githubRoutes } from "./routes/github";
import { healthRoutes } from "./routes/health";
import { modelsRoutes } from "./routes/models";
import { secretsRoutes } from "./routes/secrets";
import { sessionsRoutes } from "./routes/sessions";
import { settingsRoutes } from "./routes/settings";
import type { SandboxLogStore } from "./sandbox/log-store";
import type { SandboxManager } from "./sandbox/manager";
import type { EnvironmentService } from "./services/environment.service";
import type { EventJournal } from "./services/event-journal";
import type { ExtensionConfigService } from "./services/extension-config.service";
import type { GitHubService } from "./services/github.service";
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
    sandboxManager: SandboxManager;
    secretsService: SecretsService;
    environmentService: EnvironmentService;
    extensionConfigService: ExtensionConfigService;
    sandboxLogStore: SandboxLogStore;
    sessionDataDir: string;
    sessionHubManager: SessionHubManager;
  };
};

export interface AppServices {
  db: AppDatabase;
  sessionService: SessionService;
  eventJournal: EventJournal;
  repoService: RepoService;
  githubService: GitHubService;
  sandboxManager: SandboxManager;
  secretsService: SecretsService;
  environmentService: EnvironmentService;
  extensionConfigService: ExtensionConfigService;
  sandboxLogStore: SandboxLogStore;
  sessionDataDir: string;
  sessionHubManager: SessionHubManager;
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
    c.set("sandboxManager", services.sandboxManager);
    c.set("secretsService", services.secretsService);
    c.set("environmentService", services.environmentService);
    c.set("extensionConfigService", services.extensionConfigService);
    c.set("sandboxLogStore", services.sandboxLogStore);
    c.set("sessionDataDir", services.sessionDataDir);
    c.set("sessionHubManager", services.sessionHubManager);
    await next();
  });

  app.use("*", requestId());
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

  // Error handler
  app.onError((err, c) => {
    const logger = c.get("logger");
    logger.error(
      { err, path: c.req.path, method: c.req.method },
      "unhandled error",
    );
    return c.json({ data: null, error: "Internal server error" }, 500);
  });

  // Mount routes
  app.route("/", healthRoutes());
  app.route("/api/sessions", sessionsRoutes());
  app.route("/api/github", githubRoutes());
  app.route("/api/models", modelsRoutes());
  app.route("/api/settings", settingsRoutes());
  app.route(
    "/api/secrets",
    secretsRoutes(services.secretsService),
  );
  app.route("/api/environments", environmentsRoutes());
  app.route("/api/extension-configs", extensionConfigsRoutes());

  return app;
}
