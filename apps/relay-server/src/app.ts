import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppDatabase } from "./db/connection";
import { environmentsRoutes } from "./routes/environments";
import { githubRoutes } from "./routes/github";
import { healthRoutes } from "./routes/health";
import { modelsRoutes } from "./routes/models";
import { secretsRoutes } from "./routes/secrets";
import { sessionsRoutes } from "./routes/sessions";
import { settingsRoutes } from "./routes/settings";
import type { SandboxManager } from "./sandbox/manager";
import type { EnvironmentService } from "./services/environment.service";
import type { EventJournal } from "./services/event-journal";
import type { GitHubService } from "./services/github.service";
import type { RepoService } from "./services/repo.service";
import type { SecretsService } from "./services/secrets.service";
import type { SessionService } from "./services/session.service";

export type AppEnv = {
  Variables: {
    db: AppDatabase;
    sessionService: SessionService;
    eventJournal: EventJournal;
    repoService: RepoService;
    githubService: GitHubService;
    sandboxManager: SandboxManager;
    secretsService: SecretsService;
    environmentService: EnvironmentService;
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
    await next();
  });

  app.use("*", logger());
  app.use("*", cors());

  // Error handler
  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json({ data: null, error: "Internal server error" }, 500);
  });

  // Mount routes
  app.route("/", healthRoutes());
  app.route("/api/sessions", sessionsRoutes());
  app.route("/api/github", githubRoutes());
  app.route("/api/models", modelsRoutes());
  app.route("/api/settings", settingsRoutes());
  app.route("/api/secrets", secretsRoutes(services.secretsService));
  app.route("/api/environments", environmentsRoutes());

  return app;
}
