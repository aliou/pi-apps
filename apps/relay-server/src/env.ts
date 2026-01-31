import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

/**
 * Load .env file from config directory if it exists.
 */
export function loadEnv(configDir: string): void {
  const envPath = join(configDir, ".env");

  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`Loaded .env from ${envPath}`);
  }
}

/**
 * Sandbox provider configuration from environment.
 * These are functions to ensure they read env vars after loadEnv() is called.
 */
export function getSandboxProvider(): "mock" | "docker" {
  return (process.env.SANDBOX_PROVIDER ?? "mock") as "mock" | "docker";
}

export function getSandboxDockerImage(): string {
  return process.env.SANDBOX_DOCKER_IMAGE ?? "pi-sandbox:local";
}

/**
 * Encryption key for secrets at rest (base64-encoded 32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function getRelayEncryptionKey(): string | undefined {
  return process.env.RELAY_ENCRYPTION_KEY;
}

/**
 * Key version for encryption key rotation support.
 */
export function getRelayEncryptionKeyVersion(): number {
  return Number.parseInt(process.env.RELAY_ENCRYPTION_KEY_VERSION ?? "1", 10);
}
