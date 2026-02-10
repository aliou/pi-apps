import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pi settings.json structure (subset -- only the fields we generate).
 */
interface PiSettings {
  packages?: string[];
}

/**
 * Write a settings.json file into a session's agent directory.
 * Pi reads this from PI_CODING_AGENT_DIR/settings.json on startup.
 *
 * For Docker sandboxes, this writes to the host path which is bind-mounted
 * into the container at /data/agent.
 */
export function writeSessionSettings(
  sessionDataDir: string,
  sessionId: string,
  packages: string[],
): void {
  const agentDir = join(sessionDataDir, sessionId, "agent");
  mkdirSync(agentDir, { recursive: true });

  const settings: PiSettings = {};
  if (packages.length > 0) {
    settings.packages = packages;
  }

  writeFileSync(
    join(agentDir, "settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
}

/**
 * Build the JSON string for settings.json.
 * Used by the Cloudflare provider to write via /exec.
 */
export function buildSettingsJson(packages: string[]): string {
  const settings: PiSettings = {};
  if (packages.length > 0) {
    settings.packages = packages;
  }
  return JSON.stringify(settings, null, 2);
}
