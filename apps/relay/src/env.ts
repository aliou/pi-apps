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
