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
 */
export const SANDBOX_PROVIDER = (process.env.SANDBOX_PROVIDER ?? "mock") as
  | "mock"
  | "docker";
export const SANDBOX_DOCKER_IMAGE =
  process.env.SANDBOX_DOCKER_IMAGE ?? "pi-sandbox:local";
