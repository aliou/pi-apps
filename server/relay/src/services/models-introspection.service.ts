import { rmSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../lib/logger";
import type {
  EnvironmentSandboxConfig,
  SandboxManager,
} from "../sandbox/manager";
import type { SandboxChannel, SandboxHandle } from "../sandbox/types";
import type { ExtensionConfigService } from "./extension-config.service";
import { writeExtensionSettings } from "./settings-generator";

const log = createLogger("models-introspection");

export interface IntrospectedModel {
  provider: string;
  id: string;
  name?: string;
  [key: string]: unknown;
}

export enum IntrospectionErrorReason {
  MISSING_PROVIDER = "missing_provider",
  SANDBOX_UNAVAILABLE = "sandbox_unavailable",
  TIMEOUT = "timeout",
  EXEC_FAILED = "exec_failed",
  CHANNEL_CLOSED = "channel_closed",
  RPC_FAILED = "rpc_failed",
  RESPONSE_INVALID = "response_invalid",
  UNKNOWN = "unknown",
}

export class IntrospectionError extends Error {
  constructor(
    message: string,
    public readonly reason: IntrospectionErrorReason,
    cause?: Error,
  ) {
    super(message);
    this.name = "IntrospectionError";
    if (cause) this.cause = cause;
  }
}

export interface ModelsIntrospectionResult {
  models: IntrospectedModel[];
  error: string | null;
  errorReason?: IntrospectionErrorReason;
}

/**
 * Queries available models via Pi RPC by spinning up an ephemeral sandbox
 * for the provided environment config, sending `get_available_models`,
 * and tearing it down.
 *
 * This captures extension-defined providers/models that the built-in
 * pi-ai provider list does not include.
 */
export class ModelsIntrospectionService {
  /** Timeout for the entire introspection flow (sandbox create + RPC round-trip). */
  private static readonly TIMEOUT_MS = 30_000;

  constructor(
    private sandboxManager: SandboxManager,
    private extensionConfigService: ExtensionConfigService,
    private sessionDataDir: string,
    private envConfig: EnvironmentSandboxConfig,
  ) {}

  async getModels(): Promise<ModelsIntrospectionResult> {
    // Add overall timeout for the entire introspection
    return Promise.race([
      this.getIntrospectionWithTimeout(),
      new Promise<ModelsIntrospectionResult>((resolve) =>
        setTimeout(() => {
          resolve({
            models: [],
            error: `Models introspection timed out after ${ModelsIntrospectionService.TIMEOUT_MS}ms`,
            errorReason: IntrospectionErrorReason.TIMEOUT,
          });
        }, ModelsIntrospectionService.TIMEOUT_MS),
      ),
    ]);
  }

  private async getIntrospectionWithTimeout(): Promise<ModelsIntrospectionResult> {
    const sessionId = `introspect-models-${Date.now()}`;
    let handle: SandboxHandle | null = null;
    let channel: SandboxChannel | null = null;

    try {
      log.info({ sessionId }, "starting model introspection");

      // Write settings.json with extension packages so pi loads them
      const packages = writeExtensionSettings(
        this.sessionDataDir,
        sessionId,
        this.extensionConfigService,
        "code",
      );
      log.debug({ sessionId, packages }, "wrote extension settings");

      // Create ephemeral sandbox with real provider (manager resolves secrets)
      log.debug({ sessionId }, "creating sandbox");
      try {
        handle = await this.sandboxManager.createForSession(
          sessionId,
          this.envConfig,
        );
        log.debug(
          { sessionId, providerId: handle.providerId },
          "sandbox created successfully",
        );
      } catch (err) {
        log.error(
          {
            sessionId,
            err: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
          "sandbox create failed",
        );
        throw new IntrospectionError(
          `sandbox create failed: ${err instanceof Error ? err.message : String(err)}`,
          IntrospectionErrorReason.SANDBOX_UNAVAILABLE,
        );
      }

      // Wait for it to be running
      log.debug({ sessionId }, "resuming sandbox");
      try {
        await handle.resume();
      } catch (err) {
        throw new IntrospectionError(
          `sandbox resume failed: ${err instanceof Error ? err.message : String(err)}`,
          IntrospectionErrorReason.SANDBOX_UNAVAILABLE,
        );
      }
      log.debug({ sessionId }, "sandbox resumed");

      // Test pi is working before attaching
      log.debug({ sessionId }, "testing pi executable");
      if (!handle.exec) {
        throw new IntrospectionError(
          "Sandbox provider does not support exec",
          IntrospectionErrorReason.MISSING_PROVIDER,
        );
      }
      const piTest = await handle.exec("which pi && pi --version");
      log.debug(
        {
          sessionId,
          exitCode: piTest.exitCode,
          output: piTest.output.slice(0, 200),
        },
        "pi test result",
      );
      if (piTest.exitCode !== 0) {
        throw new IntrospectionError(
          `pi not available: ${piTest.output}`,
          IntrospectionErrorReason.EXEC_FAILED,
        );
      }

      // Attach and send RPC
      log.debug({ sessionId }, "attaching to channel");
      channel = await handle.attach();
      log.debug({ sessionId }, "channel attached");

      // Wait for pi to initialize by waiting for first output (with timeout)
      log.debug({ sessionId }, "waiting for pi initialization");
      await this.waitForPiReady(channel, sessionId, 10_000);

      const models = await this.queryModels(channel, sessionId);

      log.info(
        { sessionId, modelCount: models.length },
        "model introspection complete",
      );
      return { models, error: null };
    } catch (err) {
      if (err instanceof IntrospectionError) {
        log.error(
          { sessionId, reason: err.reason, err: err.message },
          "model introspection failed",
        );
        return { models: [], error: err.message, errorReason: err.reason };
      }
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      log.error(
        { sessionId, err: message, stack },
        "model introspection failed",
      );
      return {
        models: [],
        error: message,
        errorReason: IntrospectionErrorReason.UNKNOWN,
      };
    } finally {
      // Tear down
      channel?.close();
      if (handle) {
        try {
          await handle.terminate();
          log.debug({ sessionId }, "sandbox terminated");
        } catch {
          // Best-effort cleanup
        }
      }
      // Clean up ephemeral session data directory
      try {
        rmSync(join(this.sessionDataDir, sessionId), {
          recursive: true,
          force: true,
        });
        log.debug({ sessionId }, "session data cleaned up");
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Wait for pi to be ready by listening for any output.
   * This ensures pi has started before we send commands.
   */
  private waitForPiReady(
    channel: SandboxChannel,
    sessionId: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        unsubMessage();
        unsubClose();
        log.warn(
          { sessionId, timeoutMs },
          "pi readiness wait timed out, proceeding anyway",
        );
        resolve(); // Don't reject, just proceed
      }, timeoutMs);

      const unsubMessage = channel.onMessage((message) => {
        if (resolved) return;
        // Any output from pi means it's starting up
        const preview = message.slice(0, 50).replace(/\n/g, "\\n");
        log.debug({ sessionId, preview }, "pi output detected, proceeding");
        resolved = true;
        clearTimeout(timeout);
        unsubMessage();
        unsubClose();
        resolve();
      });

      const unsubClose = channel.onClose((reason) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        unsubMessage();
        log.error({ sessionId, reason }, "channel closed while waiting for pi");
        reject(
          new IntrospectionError(
            `Channel closed: ${reason ?? "unknown reason"}`,
            IntrospectionErrorReason.CHANNEL_CLOSED,
          ),
        );
      });
    });
  }

  private queryModels(
    channel: SandboxChannel,
    sessionId: string,
  ): Promise<IntrospectedModel[]> {
    return new Promise((resolve, reject) => {
      const commandId = `get-models-${Date.now()}`;
      log.debug(
        { sessionId, commandId },
        "sending get_available_models command",
      );

      let resolved = false;

      const cleanup = () => {
        resolved = true;
        unsubMessage();
        unsubClose();
        clearTimeout(timeout);
      };

      const timeout = setTimeout(() => {
        if (resolved) return;
        cleanup();
        log.error(
          {
            sessionId,
            commandId,
            timeoutMs: ModelsIntrospectionService.TIMEOUT_MS,
          },
          "timeout waiting for response",
        );
        reject(
          new IntrospectionError(
            "Timed out waiting for get_available_models response",
            IntrospectionErrorReason.TIMEOUT,
          ),
        );
      }, ModelsIntrospectionService.TIMEOUT_MS);

      const unsubMessage = channel.onMessage((message) => {
        if (resolved) return;

        // Log first few characters for debugging (avoid logging secrets)
        const preview = message.slice(0, 100).replace(/\n/g, "\\n");
        log.debug({ sessionId, preview }, "received message from sandbox");

        try {
          const event = JSON.parse(message);
          if (
            event.type === "response" &&
            event.command === "get_available_models" &&
            event.id === commandId
          ) {
            cleanup();

            if (event.success && event.data?.models) {
              log.debug(
                { sessionId, commandId, modelCount: event.data.models.length },
                "received successful response",
              );
              resolve(event.data.models as IntrospectedModel[]);
            } else if (!event.success) {
              const errorMsg = event.error ?? "get_available_models failed";
              log.error(
                { sessionId, commandId, error: errorMsg },
                "command failed",
              );
              reject(
                new IntrospectionError(
                  errorMsg,
                  IntrospectionErrorReason.RPC_FAILED,
                ),
              );
            } else {
              log.error(
                { sessionId, commandId },
                "invalid response: missing models data",
              );
              reject(
                new IntrospectionError(
                  "Invalid response: missing models data",
                  IntrospectionErrorReason.RESPONSE_INVALID,
                ),
              );
            }
          }
        } catch {
          // Non-JSON message (npm output, etc.) - log at trace level
          log.trace({ sessionId, preview }, "ignoring non-JSON message");
        }
      });

      const unsubClose = channel.onClose((reason) => {
        if (resolved) return;
        cleanup();
        log.error(
          { sessionId, commandId, reason },
          "channel closed before response received",
        );
        reject(
          new IntrospectionError(
            `Channel closed: ${reason ?? "unknown reason"}`,
            IntrospectionErrorReason.CHANNEL_CLOSED,
          ),
        );
      });

      // Send the RPC command
      channel.send(
        JSON.stringify({
          type: "get_available_models",
          id: commandId,
        }),
      );
    });
  }
}
