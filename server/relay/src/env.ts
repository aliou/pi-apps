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

/**
 * Idle reaper check interval in milliseconds.
 * How often the reaper scans for idle sessions.
 * Default: 60000 (60 seconds).
 */
export function getIdleCheckIntervalMs(): number {
  const val = process.env.PI_RELAY_IDLE_CHECK_INTERVAL_MS;
  return val ? Number.parseInt(val, 10) : 60_000;
}
