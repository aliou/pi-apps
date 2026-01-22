/**
 * Environment loading from data directory.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

/**
 * Load .env file from the data directory if it exists.
 */
export function loadEnv(dataDir: string): boolean {
  const envPath = join(dataDir, ".env");

  if (!existsSync(envPath)) {
    return false;
  }

  config({ path: envPath });
  console.log(`  Loaded .env from: ${envPath}`);
  return true;
}
