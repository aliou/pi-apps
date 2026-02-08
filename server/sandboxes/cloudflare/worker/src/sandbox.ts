import { Container } from "@cloudflare/containers";
import type { Env } from "./env";
import { deleteState, restoreState, saveState, stateExists } from "./state";

interface CreateBody {
  envVars?: Record<string, string>;
  repoUrl?: string;
  repoBranch?: string;
}

/**
 * Validate that a repo URL is safe for use in shell commands.
 * Only allows https:// URLs with alphanumeric path segments (and common git chars).
 */
function validateRepoUrl(url: string): boolean {
  if (!url.startsWith("https://")) {
    return false;
  }
  // Allow alphanumeric, dots, hyphens, underscores, slashes in the URL path
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    // Very permissive: allow standard URL chars in path
    return /^[\w\-./]+$/.test(pathname);
  } catch {
    return false;
  }
}

/**
 * Validate that a branch name is safe for use in shell commands.
 * Only allows alphanumeric, hyphens, dots, slashes, underscores.
 */
function validateBranch(branch: string): boolean {
  return /^[\w./-]+$/.test(branch);
}

interface ResumeBody {
  envVars?: Record<string, string>;
}

export class PiSandbox extends Container<Env> {
  // Bridge server port inside the container
  defaultPort = 4000;

  // 1 hour idle timeout before auto-sleep.
  // The relay should explicitly pause before this fires.
  sleepAfter = "1h";

  override onStart(): void {
    console.log(`[PiSandbox] Container started for ${this.ctx.id.toString()}`);
  }

  override onStop(params: { exitCode: number; reason: string }): void {
    console.log(
      `[PiSandbox] Container stopped: ${params.reason} (exit: ${params.exitCode})`,
    );
  }

  override async onActivityExpired(): Promise<void> {
    console.log("[PiSandbox] Activity expired, saving state before sleep");
    try {
      await this.backupState();
    } catch (err) {
      console.error(
        "[PiSandbox] Failed to save state on activity expiry:",
        err,
      );
    }
    await this.destroy();
  }

  /**
   * Internal HTTP router for requests forwarded by the Worker entrypoint.
   * Lifecycle requests are handled directly. Everything else (including WS
   * upgrades) falls through to the Container base class which forwards to
   * the running container.
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/create":
        return this.handleCreate(request);
      case "/status":
        return this.handleStatus();
      case "/pause":
        return this.handlePause();
      case "/resume":
        return this.handleResume(request);
      case "/terminate":
        return this.handleTerminate();
      default:
        return super.fetch(request);
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  private async handleCreate(request: Request): Promise<Response> {
    const body = (await request.json()) as CreateBody;

    const state = await this.getState();
    if (state.status === "running" || state.status === "healthy") {
      return Response.json({
        status: state.status,
        message: "Already running",
      });
    }

    // Check for transient "stopping" state
    if (state.status === "stopping") {
      return Response.json(
        { status: "stopping", message: "Container is stopping, please retry" },
        { status: 409 },
      );
    }

    const envVars: Record<string, string> = {
      ...body.envVars,
      WAIT_FOR_RESTORE: "false",
    };

    await this.startAndWaitForPorts({
      startOptions: { envVars, enableInternet: true },
      cancellationOptions: { portReadyTimeoutMS: 30_000 },
    });

    if (body.repoUrl) {
      await this.cloneRepo(body.repoUrl, body.repoBranch);
    }

    return Response.json({ status: "running" });
  }

  private async handleStatus(): Promise<Response> {
    const state = await this.getState();
    const hasBackup = await stateExists(this.env.STATE_BUCKET, this.sessionId);
    return Response.json({ ...state, hasBackup });
  }

  private async handlePause(): Promise<Response> {
    const state = await this.getState();

    if (state.status === "running" || state.status === "healthy") {
      await this.backupState();
      await this.destroy();
      return Response.json({
        status: "paused",
        message: "State saved, container destroyed",
      });
    }

    if (state.status === "stopped" || state.status === "stopped_with_code") {
      return Response.json({ status: "already_stopped" });
    }

    return Response.json(
      { status: state.status, message: "Cannot pause in this state" },
      { status: 400 },
    );
  }

  private async handleResume(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as ResumeBody;

    const hasBackup = await stateExists(this.env.STATE_BUCKET, this.sessionId);

    const envVars: Record<string, string> = {
      ...body.envVars,
      WAIT_FOR_RESTORE: hasBackup ? "true" : "false",
    };

    await this.startAndWaitForPorts({
      startOptions: { envVars, enableInternet: true },
      cancellationOptions: { portReadyTimeoutMS: 30_000 },
    });

    if (hasBackup) {
      try {
        await restoreState(this.env.STATE_BUCKET, this.sessionId, this);
      } catch (err) {
        console.error(
          "[PiSandbox] Restore failed, deleting corrupted state:",
          err,
        );
        await deleteState(this.env.STATE_BUCKET, this.sessionId);
        return Response.json(
          {
            status: "error",
            message: "State restore failed, created fresh sandbox",
          },
          { status: 500 },
        );
      }
    }

    return Response.json({ status: "running", restored: hasBackup });
  }

  private async handleTerminate(): Promise<Response> {
    const state = await this.getState();

    if (state.status === "running" || state.status === "healthy") {
      await this.destroy();
    }

    await deleteState(this.env.STATE_BUCKET, this.sessionId);

    return Response.json({ status: "terminated" });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private get sessionId(): string {
    return this.ctx.id.toString();
  }

  /**
   * Backup /workspace + /data/agent to R2 via the bridge's /backup endpoint.
   */
  private async backupState(): Promise<void> {
    const response = await this.containerFetch("http://localhost:4000/backup", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        `Backup failed: ${response.status} ${await response.text()}`,
      );
    }

    // R2 put() requires known content length -- buffer the tar before uploading
    const body = await response.arrayBuffer();
    await saveState(this.env.STATE_BUCKET, this.sessionId, body);
  }

  /**
   * Clone a git repo into /workspace via the bridge's /exec endpoint.
   */
  private async cloneRepo(repoUrl: string, branch?: string): Promise<void> {
    // Validate repo URL to prevent command injection
    if (!validateRepoUrl(repoUrl)) {
      throw new Error(
        `Invalid repo URL: must be https:// with valid path characters`,
      );
    }

    // Validate branch if provided
    if (branch && !validateBranch(branch)) {
      throw new Error(
        `Invalid branch name: only alphanumeric, hyphens, dots, slashes, underscores allowed`,
      );
    }

    const branchArg = branch ? ` --branch ${branch}` : "";
    const cmd = `git clone${branchArg} ${repoUrl} /workspace`;

    const response = await this.containerFetch("http://localhost:4000/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Clone failed: ${text}`);
    }
  }
}
