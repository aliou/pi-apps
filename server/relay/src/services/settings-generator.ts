import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pi settings.json structure (subset -- only the fields we generate).
 *
 * - `packages` triggers `pi install` (npm/git sources) on startup.
 * - `extensions` references local directories; pi loads them directly
 *   without running any install step.
 */
interface PiSettings {
  packages?: string[];
  extensions?: string[];
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
  options: {
    packages?: string[];
    extensions?: string[];
  },
): void {
  const agentDir = join(sessionDataDir, sessionId, "agent");
  mkdirSync(agentDir, { recursive: true });

  const settings = buildSettings(options);
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
  return JSON.stringify(buildSettings({ packages }), null, 2);
}

function buildSettings(options: {
  packages?: string[];
  extensions?: string[];
}): PiSettings {
  const settings: PiSettings = {};
  if (options.packages && options.packages.length > 0) {
    settings.packages = options.packages;
  }
  if (options.extensions && options.extensions.length > 0) {
    settings.extensions = options.extensions;
  }
  return settings;
}
