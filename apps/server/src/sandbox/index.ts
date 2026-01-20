/**
 * Sandbox abstraction module.
 *
 * Provides a unified interface for running pi-server sessions in ephemeral
 * sandbox environments. Supports multiple providers:
 *
 * - Modal (https://modal.com) - via "modal" npm package
 * - Koyeb (https://koyeb.com) - via "@koyeb/sandbox-sdk" npm package
 *
 * @example
 * ```typescript
 * import { createSandboxProvider, SandboxSessionManager } from "./sandbox";
 *
 * // Create a provider
 * const provider = createSandboxProvider({
 *   provider: "koyeb",
 *   apiToken: process.env.KOYEB_API_TOKEN!,
 * });
 *
 * // Create session manager
 * const manager = new SandboxSessionManager({
 *   provider,
 *   image: "node:20-slim",
 *   env: {
 *     ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
 *   },
 * });
 *
 * // Create a session (runs in sandbox)
 * const session = await manager.createSession("code", "owner/repo");
 *
 * // Wait for it to be ready
 * await manager.waitForSession(session.sessionId);
 *
 * // Send commands
 * await manager.sendRequest(session.sessionId, "prompt", { message: "Hello" });
 *
 * // Clean up
 * await manager.deleteSession(session.sessionId);
 * ```
 */

// Types
export type {
  ExecOptions,
  ExecOutput,
  ExecResult,
  Sandbox,
  SandboxConnection,
  SandboxCreateOptions,
  SandboxInfo,
  SandboxInstanceType,
  SandboxProvider,
  SandboxProviderConfig,
  SandboxStatus,
} from "./types.js";

export { INSTANCE_SPECS } from "./types.js";

// Providers
export { ModalSandboxProvider } from "./modal.js";
export { KoyebSandboxProvider } from "./koyeb.js";

// Session manager
export {
  SandboxSessionManager,
  type SandboxSession,
  type SandboxSessionConfig,
  type SandboxSessionEventCallback,
} from "./manager.js";

// Provider factory
import type { SandboxProvider, SandboxProviderConfig } from "./types.js";
import { ModalSandboxProvider } from "./modal.js";
import { KoyebSandboxProvider } from "./koyeb.js";

/**
 * Create a sandbox provider from configuration.
 */
export function createSandboxProvider(
  config: SandboxProviderConfig,
): SandboxProvider {
  switch (config.provider) {
    case "modal":
      return new ModalSandboxProvider(config);
    case "koyeb":
      return new KoyebSandboxProvider(config);
    default:
      throw new Error(`Unknown sandbox provider: ${config.provider}`);
  }
}

/**
 * Get sandbox provider from environment variables.
 *
 * Reads configuration from:
 * - SANDBOX_PROVIDER: "modal" or "koyeb"
 * - MODAL_TOKEN_ID + MODAL_TOKEN_SECRET: Modal credentials
 * - KOYEB_API_TOKEN: Koyeb credentials
 */
export function getSandboxProviderFromEnv(): SandboxProvider | null {
  const providerType = process.env.SANDBOX_PROVIDER as
    | "modal"
    | "koyeb"
    | undefined;

  if (!providerType) {
    return null;
  }

  let apiToken: string;

  if (providerType === "modal") {
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;

    if (!tokenId || !tokenSecret) {
      console.warn(
        "SANDBOX_PROVIDER=modal but MODAL_TOKEN_ID/MODAL_TOKEN_SECRET not set",
      );
      return null;
    }

    apiToken = `${tokenId}:${tokenSecret}`;
  } else if (providerType === "koyeb") {
    apiToken = process.env.KOYEB_API_TOKEN ?? "";

    if (!apiToken) {
      console.warn("SANDBOX_PROVIDER=koyeb but KOYEB_API_TOKEN not set");
      return null;
    }
  } else {
    console.warn(`Unknown SANDBOX_PROVIDER: ${providerType}`);
    return null;
  }

  return createSandboxProvider({
    provider: providerType,
    apiToken,
    defaultImage:
      process.env.SANDBOX_IMAGE ?? "node:20-slim",
    defaultInstanceType:
      (process.env.SANDBOX_INSTANCE_TYPE as
        | "nano"
        | "small"
        | "medium"
        | "large") ?? "small",
    defaultTimeout: process.env.SANDBOX_TIMEOUT
      ? parseInt(process.env.SANDBOX_TIMEOUT, 10) * 1000
      : 30 * 60 * 1000,
    defaultIdleTimeout: process.env.SANDBOX_IDLE_TIMEOUT
      ? parseInt(process.env.SANDBOX_IDLE_TIMEOUT, 10) * 1000
      : 5 * 60 * 1000,
  });
}
