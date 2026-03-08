import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionConfigService } from "./extension-config.service";

interface PiSettings {
  packages?: string[];
  extensions?: string[];
  extensionConfig?: Record<string, Record<string, unknown>>;
}

export function writeExtensionSettings(
  sessionDataDir: string,
  sessionId: string,
  extensionConfigService: ExtensionConfigService,
  mode: "chat" | "code",
): string[] {
  const resolved = extensionConfigService.getResolvedPackageEntries(sessionId, mode);
  const packages = resolved.map((entry) => entry.package);
  const extensionConfig = Object.fromEntries(
    resolved
      .filter((entry) => Object.keys(entry.config).length > 0)
      .map((entry) => [entry.package, entry.config]),
  );

  writeSessionSettings(sessionDataDir, sessionId, {
    packages,
    extensionConfig,
  });
  return packages;
}

export function writeSessionSettings(
  sessionDataDir: string,
  sessionId: string,
  options: {
    packages?: string[];
    extensions?: string[];
    extensionConfig?: Record<string, Record<string, unknown>>;
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

export function buildSettingsJson(
  packages: string[],
  extensionConfig?: Record<string, Record<string, unknown>>,
): string {
  return JSON.stringify(buildSettings({ packages, extensionConfig }), null, 2);
}

function buildSettings(options: {
  packages?: string[];
  extensions?: string[];
  extensionConfig?: Record<string, Record<string, unknown>>;
}): PiSettings {
  const settings: PiSettings = {};
  if (options.packages && options.packages.length > 0) {
    settings.packages = options.packages;
  }
  if (options.extensions && options.extensions.length > 0) {
    settings.extensions = options.extensions;
  }
  if (options.extensionConfig && Object.keys(options.extensionConfig).length > 0) {
    settings.extensionConfig = options.extensionConfig;
  }
  return settings;
}
