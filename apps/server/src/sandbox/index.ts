/**
 * Sandbox abstraction module.
 *
 * Provides a unified interface for running pi-server sessions in ephemeral
 * sandbox environments. Supports multiple providers:
 *
 * - Modal (https://modal.com) - via "modal" npm package
 * - Koyeb (https://koyeb.com) - via "@koyeb/sandbox-sdk" npm package
 * - Cloudflare (https://developers.cloudflare.com/sandbox/) - via Worker proxy
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

// Providers
export { CloudflareSandboxProvider } from "./cloudflare.js";
export { KoyebSandboxProvider } from "./koyeb.js";
// Session manager
export {
  type SandboxSession,
  type SandboxSessionConfig,
  type SandboxSessionEventCallback,
  SandboxSessionManager,
} from "./manager.js";
export { ModalSandboxProvider } from "./modal.js";
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

// Provider factory
import { CloudflareSandboxProvider } from "./cloudflare.js";
import { KoyebSandboxProvider } from "./koyeb.js";
import { ModalSandboxProvider } from "./modal.js";
import type { SandboxProvider, SandboxProviderConfig } from "./types.js";

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
    case "cloudflare":
      return new CloudflareSandboxProvider(config);
    default:
      throw new Error(`Unknown sandbox provider: ${config.provider}`);
  }
}

/**
 * Get sandbox provider from environment variables.
 *
 * Reads configuration from:
 * - SANDBOX_PROVIDER: "modal", "koyeb", or "cloudflare"
 * - MODAL_TOKEN_ID + MODAL_TOKEN_SECRET: Modal credentials
 * - KOYEB_API_TOKEN: Koyeb credentials
 * - CLOUDFLARE_SANDBOX_WORKER_URL + CLOUDFLARE_API_TOKEN: Cloudflare credentials
 */
export function getSandboxProviderFromEnv(): SandboxProvider | null {
  const providerType = process.env.SANDBOX_PROVIDER as
    | "modal"
    | "koyeb"
    | "cloudflare"
    | undefined;

  if (!providerType) {
    return null;
  }

  let apiToken: string;
  let providerConfig: Record<string, unknown> | undefined;

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
  } else if (providerType === "cloudflare") {
    const workerUrl = process.env.CLOUDFLARE_SANDBOX_WORKER_URL;
    apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

    if (!workerUrl) {
      console.warn(
        "SANDBOX_PROVIDER=cloudflare but CLOUDFLARE_SANDBOX_WORKER_URL not set",
      );
      return null;
    }
    if (!apiToken) {
      console.warn(
        "SANDBOX_PROVIDER=cloudflare but CLOUDFLARE_API_TOKEN not set",
      );
      return null;
    }

    providerConfig = { workerUrl };
  } else {
    console.warn(`Unknown SANDBOX_PROVIDER: ${providerType}`);
    return null;
  }

  return createSandboxProvider({
    provider: providerType,
    apiToken,
    defaultImage: process.env.SANDBOX_IMAGE ?? "node:20-slim",
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
    providerConfig,
  });
}
