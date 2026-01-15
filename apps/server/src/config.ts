/**
 * Server configuration and data directory resolution.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ServerConfig {
  port: number;
  host: string; // Use "::" for dual-stack (IPv4 + IPv6)
  dataDir: string;
}

/**
 * Get the data directory following XDG spec.
 * Priority: CLI arg > env var > XDG_DATA_HOME > ~/.local/share
 */
export function getDataDir(override?: string): string {
  if (override) return override;

  if (process.env.PI_SERVER_DATA_DIR) {
    return process.env.PI_SERVER_DATA_DIR;
  }

  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return join(xdgDataHome, "pi-server");
  }

  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME environment variable not set");
  }

  return join(home, ".local", "share", "pi-server");
}

/**
 * Ensure all required data directories exist.
 */
export function ensureDataDirs(dataDir: string): void {
  const dirs = [dataDir, join(dataDir, "sessions"), join(dataDir, "worktrees")];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Parse CLI arguments.
 */
export function parseArgs(args: string[]): ServerConfig {
  let port = parseInt(process.env.PI_SERVER_PORT || "3000", 10);
  let host = "::";
  let dataDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--port" || arg === "-p") {
      port = parseInt(args[++i], 10);
      if (Number.isNaN(port)) {
        throw new Error(`Invalid port: ${args[i]}`);
      }
    } else if (arg === "--host") {
      host = args[++i];
    } else if (arg === "--data-dir") {
      dataDir = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return {
    port,
    host,
    dataDir: getDataDir(dataDir),
  };
}

function printHelp(): void {
  console.log(`
pi-server - WebSocket server for pi coding agent

Usage:
  pi-server [options]

Options:
  --port, -p <port>       Listen port (default: 3000, env: PI_SERVER_PORT)
  --host <host>           Bind host (default: :: for dual-stack)
  --data-dir <path>       Data directory (env: PI_SERVER_DATA_DIR)
                          Default: $XDG_DATA_HOME/pi-server or ~/.local/share/pi-server
  --help, -h              Show this help

Data Directory Structure:
  <data-dir>/
    repos.json            Repo definitions
    sessions/             Pi session files
    worktrees/            Git worktrees per session
    state.json            Server state
`);
}
