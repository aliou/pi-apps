import { setInterval } from "node:timers/promises";
import { createLogger } from "../lib/logger";
import type { resolveEnvConfig, SandboxManager } from "../sandbox/manager";
import type { SandboxProviderType } from "../sandbox/provider-types";
import type { ConnectionManager } from "../ws/connection";
import type {
  EnvironmentConfig,
  EnvironmentService,
} from "./environment.service";
import type { SecretsService } from "./secrets.service";
import type { SessionRecord, SessionService } from "./session.service";

export interface IdleReaperDeps {
  sessionService: SessionService;
  environmentService: EnvironmentService;
  secretsService: SecretsService;
  sandboxManager: SandboxManager;
  connectionManager: ConnectionManager;
  resolveEnvConfig: typeof resolveEnvConfig;
  checkIntervalMs: number;
}

const log = createLogger("idle-reaper");

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
    const envs = this.deps.environmentService.list();
    const timeoutMap = new Map<string, number>();

    for (const env of envs) {
      // Cloudflare manages its own idle timeout via Durable Object sleepAfter
      if (env.sandboxType === "cloudflare") continue;

      const config = JSON.parse(env.config) as EnvironmentConfig;
      timeoutMap.set(env.id, config.idleTimeoutSeconds ?? 3600);
    }

    const activeSessions = this.deps.sessionService.listActiveSessions();
    const now = Date.now();

    for (const session of activeSessions) {
      try {
        // Skip sessions without an environment (mock/chat sessions)
        if (!session.environmentId) continue;

        const timeoutSeconds = timeoutMap.get(session.environmentId);
        // Skip if environment not in map (e.g., Cloudflare, or unknown env)
        if (timeoutSeconds === undefined) continue;

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

    // 1. Notify connected clients
    this.deps.connectionManager.broadcast(session.id, {
      type: "sandbox_status",
      status: "paused",
      message: "Session idled due to inactivity",
    });

    // 2. Pause the sandbox
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

    // 3. Update session status
    this.deps.sessionService.update(session.id, { status: "idle" });
  }
}
