import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "pi-relay";

/**
 * XDG Base Directory paths with environment variable overrides.
 *
 * Priority: PI_RELAY_* env > XDG_* env > XDG defaults
 *
 * See: https://specifications.freedesktop.org/basedir-spec/latest/
 */
export function getXdgPaths() {
  const home = homedir();

  // XDG defaults
  const xdgDataHome =
    process.env.XDG_DATA_HOME || join(home, ".local", "share");
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(home, ".config");
  const xdgCacheHome = process.env.XDG_CACHE_HOME || join(home, ".cache");
  const xdgStateHome =
    process.env.XDG_STATE_HOME || join(home, ".local", "state");

  return {
    // PI_RELAY_DATA_DIR > XDG_DATA_HOME/pi-relay
    dataDir: process.env.PI_RELAY_DATA_DIR || join(xdgDataHome, APP_NAME),

    // PI_RELAY_CONFIG_DIR > XDG_CONFIG_HOME/pi-relay
    configDir: process.env.PI_RELAY_CONFIG_DIR || join(xdgConfigHome, APP_NAME),

    // PI_RELAY_CACHE_DIR > XDG_CACHE_HOME/pi-relay
    cacheDir: process.env.PI_RELAY_CACHE_DIR || join(xdgCacheHome, APP_NAME),

    // PI_RELAY_STATE_DIR > XDG_STATE_HOME/pi-relay (logs, runtime state)
    stateDir: process.env.PI_RELAY_STATE_DIR || join(xdgStateHome, APP_NAME),
  };
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  configDir: string;
  cacheDir: string;
  stateDir: string;
  tlsCert?: string;
  tlsKey?: string;
}

/**
 * Parse CLI arguments and environment variables to build config.
 *
 * Priority: CLI args > PI_RELAY_* env > XDG env > XDG defaults
 */
export function parseConfig(args: string[]): Config {
  const xdg = getXdgPaths();

  const config: Config = {
    port: parseInt(process.env.PI_RELAY_PORT || "31415", 10),
    host: process.env.PI_RELAY_HOST || "0.0.0.0",
    dataDir: xdg.dataDir,
    configDir: xdg.configDir,
    cacheDir: xdg.cacheDir,
    stateDir: xdg.stateDir,
    tlsCert: process.env.PI_RELAY_TLS_CERT,
    tlsKey: process.env.PI_RELAY_TLS_KEY,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--port":
        if (nextArg) {
          config.port = parseInt(nextArg, 10);
          i++;
        }
        break;
      case "--host":
        if (nextArg) {
          config.host = nextArg;
          i++;
        }
        break;
      case "--data-dir":
        if (nextArg) {
          config.dataDir = nextArg;
          i++;
        }
        break;
      case "--config-dir":
        if (nextArg) {
          config.configDir = nextArg;
          i++;
        }
        break;
      case "--cache-dir":
        if (nextArg) {
          config.cacheDir = nextArg;
          i++;
        }
        break;
      case "--state-dir":
        if (nextArg) {
          config.stateDir = nextArg;
          i++;
        }
        break;
      case "--tls-cert":
        if (nextArg) {
          config.tlsCert = nextArg;
          i++;
        }
        break;
      case "--tls-key":
        if (nextArg) {
          config.tlsKey = nextArg;
          i++;
        }
        break;
    }
  }

  return config;
}

/**
 * Paths derived from config directories.
 */
export interface DataPaths {
  dataDir: string;
  configDir: string;
  cacheDir: string;
  stateDir: string;
  dbPath: string;
  logsDir: string;
  migrationsDir: string;
}

/**
 * Ensure all directories exist and return resolved paths.
 */
export function ensureDataDirs(config: Config): DataPaths {
  const dirs = [
    config.dataDir,
    config.configDir,
    config.cacheDir,
    config.stateDir,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const logsDir = join(config.stateDir, "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  return {
    dataDir: config.dataDir,
    configDir: config.configDir,
    cacheDir: config.cacheDir,
    stateDir: config.stateDir,
    dbPath: process.env.PI_RELAY_DB_PATH || join(config.dataDir, "relay.db"),
    logsDir,
    migrationsDir: join(import.meta.dirname, "db", "migrations"),
  };
}
