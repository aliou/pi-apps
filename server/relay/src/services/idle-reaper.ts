import { setInterval } from "node:timers/promises";
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
      console.error("[idle-reaper] unexpected error in run loop:", err);
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

        await this.suspendSession(session, idleMs);
      } catch (err) {
        console.error(
          `[idle-reaper] failed to suspend session=${session.id}:`,
          err,
        );
      }
    }
  }

  private async suspendSession(
    session: SessionRecord,
    idleMs: number,
  ): Promise<void> {
    const idleMinutes = Math.round(idleMs / 60_000);
    console.log(
      `[idle-reaper] suspending session=${session.id} idle=${idleMinutes}m`,
    );

    // 1. Notify connected clients
    this.deps.connectionManager.broadcast(session.id, {
      type: "sandbox_status",
      status: "paused",
      message: "Session suspended due to inactivity",
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
      const handle = await this.deps.sandboxManager.getHandleByType(
        session.sandboxProvider as SandboxProviderType,
        session.sandboxProviderId,
        envConfig,
      );
      await handle.pause();
    }

    // 3. Update session status
    this.deps.sessionService.update(session.id, { status: "suspended" });
  }
}
