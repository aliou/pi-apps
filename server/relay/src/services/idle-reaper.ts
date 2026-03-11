import { setInterval } from "node:timers/promises";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { settings } from "../db/schema";
import { createLogger } from "../lib/logger";
import type { resolveEnvConfig, SandboxManager } from "../sandbox/manager";
import type { SandboxProviderType } from "../sandbox/provider-types";
import type { SessionHubManager } from "../ws/session-hub";
import type {
  EnvironmentConfig,
  EnvironmentService,
} from "./environment.service";
import type { SecretsService } from "./secrets.service";
import type { SessionRecord, SessionService } from "./session.service";

export interface IdlePolicy {
  defaultTimeoutSeconds: number;
  graceAfterDisconnectSeconds: number;
  disableForModes?: Array<"chat" | "code">;
}

export interface IdleReaperDeps {
  db: AppDatabase;
  sessionService: SessionService;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
  sandboxManager: SandboxManager;
  sessionHubManager: SessionHubManager;
  resolveEnvConfig: typeof resolveEnvConfig;
  checkIntervalMs: number;
}

const log = createLogger("idle-reaper");
const IDLE_POLICY_KEY = "idle_policy";
const DEFAULT_IDLE_POLICY: IdlePolicy = {
  defaultTimeoutSeconds: 7_200,
  graceAfterDisconnectSeconds: 300,
};

export class IdleReaper {
  private controller: AbortController | null = null;

  constructor(private deps: IdleReaperDeps) {}

  start(): void {
    this.controller = new AbortController();
    this.run(this.controller.signal);
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private async run(signal: AbortSignal): Promise<void> {
    try {
      for await (const _ of setInterval(this.deps.checkIntervalMs, null, {
        signal,
      })) {
        await this.tick();
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      log.error({ err }, "unexpected error in run loop");
    }
  }

  async tick(): Promise<void> {
    const policy = this.readIdlePolicy();
    const envs = this.deps.environmentService.list();
    const timeoutMap = new Map<string, number>();

    for (const env of envs) {
      if (env.sandboxType === "cloudflare") continue;

      const config = JSON.parse(env.config) as EnvironmentConfig;
      timeoutMap.set(
        env.id,
        config.idleTimeoutSeconds ?? policy.defaultTimeoutSeconds,
      );
    }

    const activeSessions = this.deps.sessionService.listActiveSessions();
    const now = Date.now();

    for (const session of activeSessions) {
      try {
        if (!session.environmentId) continue;
        if (policy.disableForModes?.includes(session.mode)) continue;

        const timeoutSeconds = timeoutMap.get(session.environmentId);
        if (timeoutSeconds === undefined) continue;

        const hubState = this.deps.sessionHubManager.getIdleState(session.id);
        if (hubState.connectionCount > 0) {
          log.debug(
            {
              sessionId: session.id,
              connectionCount: hubState.connectionCount,
            },
            "skipping idle: active connections",
          );
          continue;
        }

        if (
          hubState.lastDisconnectedAt &&
          now - hubState.lastDisconnectedAt <
            policy.graceAfterDisconnectSeconds * 1000
        ) {
          log.debug(
            {
              sessionId: session.id,
              lastDisconnectedAt: hubState.lastDisconnectedAt,
              graceAfterDisconnectSeconds: policy.graceAfterDisconnectSeconds,
            },
            "skipping idle: reconnect grace",
          );
          continue;
        }

        if (hubState.hasRunningTools) {
          log.debug(
            { sessionId: session.id },
            "skipping idle: tool still running",
          );
          continue;
        }

        const lastActivity = new Date(session.lastActivityAt).getTime();
        const idleMs = now - lastActivity;
        if (idleMs < timeoutSeconds * 1000) continue;

        await this.idleSession(session, idleMs);
      } catch (err) {
        log.error({ err, sessionId: session.id }, "failed to idle session");
      }
    }
  }

  private async idleSession(
    session: SessionRecord,
    idleMs: number,
  ): Promise<void> {
    const idleMinutes = Math.round(idleMs / 60_000);
    log.info({ sessionId: session.id, idleMinutes }, "idling session");

    const hubState = this.deps.sessionHubManager.getIdleState(session.id);
    if (hubState.connectionCount > 0) {
      log.debug(
        { sessionId: session.id, connectionCount: hubState.connectionCount },
        "aborting idle: clients connected",
      );
      return;
    }

    this.deps.sessionHubManager.broadcast(session.id, {
      type: "sandbox_status",
      status: "paused",
      message: "Session idled due to inactivity",
    });

    this.deps.sessionHubManager.clearSessionClientState(session.id);

    if (session.sandboxProvider && session.sandboxProviderId) {
      let envConfig: Awaited<ReturnType<typeof resolveEnvConfig>> | undefined;
      if (session.environmentId) {
        const env = this.deps.environmentService.get(session.environmentId);
        if (env) {
          envConfig = await this.deps.resolveEnvConfig(
            env,
            this.deps.secretsService,
          );
        }
      }

      try {
        const handle = await this.deps.sandboxManager.getHandleByType(
          session.sandboxProvider as SandboxProviderType,
          session.sandboxProviderId,
          envConfig,
        );
        await handle.pause();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const notFound =
          message.includes("Sandbox not found") ||
          message.includes("not a sandbox");

        if (!notFound) {
          throw err;
        }

        log.warn(
          { sessionId: session.id, providerId: session.sandboxProviderId },
          "sandbox already gone",
        );
      }
    }

    this.deps.sessionService.update(session.id, { status: "idle" });
  }

  private readIdlePolicy(): IdlePolicy {
    const row = this.deps.db
      .select()
      .from(settings)
      .where(eq(settings.key, IDLE_POLICY_KEY))
      .get();

    if (!row) {
      return DEFAULT_IDLE_POLICY;
    }

    try {
      const parsed = JSON.parse(row.value) as Partial<IdlePolicy>;
      return {
        defaultTimeoutSeconds:
          typeof parsed.defaultTimeoutSeconds === "number" &&
          parsed.defaultTimeoutSeconds > 0
            ? parsed.defaultTimeoutSeconds
            : DEFAULT_IDLE_POLICY.defaultTimeoutSeconds,
        graceAfterDisconnectSeconds:
          typeof parsed.graceAfterDisconnectSeconds === "number" &&
          parsed.graceAfterDisconnectSeconds >= 0
            ? parsed.graceAfterDisconnectSeconds
            : DEFAULT_IDLE_POLICY.graceAfterDisconnectSeconds,
        ...(Array.isArray(parsed.disableForModes)
          ? { disableForModes: parsed.disableForModes }
          : {}),
      };
    } catch {
      return DEFAULT_IDLE_POLICY;
    }
  }
}
