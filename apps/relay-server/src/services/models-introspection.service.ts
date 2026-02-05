import type { SandboxManager } from "../sandbox/manager";
import type { SandboxChannel, SandboxHandle } from "../sandbox/types";
import type { SecretsService } from "./secrets.service";

export interface IntrospectedModel {
  provider: string;
  modelId: string;
  [key: string]: unknown;
}

export interface ModelsIntrospectionResult {
  models: IntrospectedModel[];
  error: string | null;
}

/**
 * Queries available models via Pi RPC by spinning up an ephemeral sandbox,
 * sending `get_available_models`, and tearing it down.
 *
 * This captures extension-defined providers/models that the built-in
 * pi-ai provider list does not include.
 */
export class ModelsIntrospectionService {
  /** Timeout for the entire introspection flow (sandbox create + RPC round-trip). */
  private static readonly TIMEOUT_MS = 30_000;

  constructor(
    private sandboxManager: SandboxManager,
    private secretsService: SecretsService,
  ) {}

  async getModels(): Promise<ModelsIntrospectionResult> {
    const sessionId = `introspect-models-${Date.now()}`;
    let handle: SandboxHandle | null = null;
    let channel: SandboxChannel | null = null;

    try {
      // Get secrets for the sandbox
      const secrets = await this.secretsService.getAllAsEnv();

      // Create ephemeral sandbox
      handle = await this.sandboxManager.createForSession(sessionId, {
        secrets,
      });

      // Wait for it to be running
      await handle.resume(secrets);

      // Attach and send RPC
      channel = await handle.attach();
      const models = await this.queryModels(channel);

      return { models, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { models: [], error: message };
    } finally {
      // Tear down
      channel?.close();
      if (handle) {
        try {
          await handle.terminate();
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }

  private queryModels(channel: SandboxChannel): Promise<IntrospectedModel[]> {
    return new Promise((resolve, reject) => {
      const commandId = `get-models-${Date.now()}`;

      const timeout = setTimeout(() => {
        unsubMessage();
        reject(
          new Error("Timed out waiting for get_available_models response"),
        );
      }, ModelsIntrospectionService.TIMEOUT_MS);

      const unsubMessage = channel.onMessage((message) => {
        try {
          const event = JSON.parse(message);
          if (
            event.type === "response" &&
            event.command === "get_available_models" &&
            event.id === commandId
          ) {
            clearTimeout(timeout);
            unsubMessage();

            if (event.success && event.data?.models) {
              resolve(event.data.models as IntrospectedModel[]);
            } else {
              reject(new Error(event.error ?? "get_available_models failed"));
            }
          }
        } catch {
          // Ignore non-JSON or unrelated messages
        }
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
