/**
 * Server configuration and data directory resolution.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ServerConfig {
  port: number;
  host: string; // Use "::" for dual-stack (IPv4 + IPv6)
  dataDir: string;
  tls?: {
    cert: string;
    key: string;
  };
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
  const dirs = [dataDir, join(dataDir, "sessions")];

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
  let port = parseInt(process.env.PI_SERVER_PORT || "3141", 10);
  let host = "::";
  let dataDir: string | undefined;
  let tlsCert: string | undefined;
  let tlsKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--port" || arg === "-p") {
      const portArg = args[++i];
      if (!portArg) throw new Error("Missing value for --port");
      port = parseInt(portArg, 10);
      if (Number.isNaN(port)) {
        throw new Error(`Invalid port: ${portArg}`);
      }
    } else if (arg === "--host") {
      const hostArg = args[++i];
      if (!hostArg) throw new Error("Missing value for --host");
      host = hostArg;
    } else if (arg === "--data-dir") {
      const dataDirArg = args[++i];
      if (!dataDirArg) throw new Error("Missing value for --data-dir");
      dataDir = dataDirArg;
    } else if (arg === "--tls-cert") {
      const certArg = args[++i];
      if (!certArg) throw new Error("Missing value for --tls-cert");
      tlsCert = certArg;
    } else if (arg === "--tls-key") {
      const keyArg = args[++i];
      if (!keyArg) throw new Error("Missing value for --tls-key");
      tlsKey = keyArg;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  const config: ServerConfig = {
    port,
    host,
    dataDir: getDataDir(dataDir),
  };

  if (tlsCert && tlsKey) {
    config.tls = { cert: tlsCert, key: tlsKey };
  } else if (tlsCert || tlsKey) {
    throw new Error("Both --tls-cert and --tls-key must be provided together");
  }

  return config;
}

function printHelp(): void {
  console.log(`
pi-server - WebSocket server for pi coding agent

Usage:
  pi-server [options]

Options:
  --port, -p <port>       Listen port (default: 3141, env: PI_SERVER_PORT)
  --host <host>           Bind host (default: :: for dual-stack)
  --data-dir <path>       Data directory (env: PI_SERVER_DATA_DIR)
                          Default: $XDG_DATA_HOME/pi-server or ~/.local/share/pi-server
  --tls-cert <path>       TLS certificate file (enables HTTPS/WSS)
  --tls-key <path>        TLS private key file
  --help, -h              Show this help

Data Directory Structure:
  <data-dir>/
    repos.json            Repo definitions
    sessions/             Pi session files + session repos
    state.json            Server state
`);
}
