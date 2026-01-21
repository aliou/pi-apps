/**
 * Server configuration and data directory resolution.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface ServerConfig {
  port: number;
  host: string; // Use "::" for dual-stack (IPv4 + IPv6)
  dataDir: string;
  sandbox?: SandboxConfig;
}

export interface SandboxConfig {
  /** Sandbox provider: "modal", "koyeb", "cloudflare", or "docker" */
  provider: "modal" | "koyeb" | "cloudflare" | "docker";
  /** API token for the provider (not required for docker) */
  apiToken?: string;
  /** Docker image (default: "node:20-slim") */
  image?: string;
  /** Instance type (default: "small") */
  instanceType?: "nano" | "small" | "medium" | "large";
  /** Sandbox timeout in ms (default: 30 minutes) */
  timeout?: number;
  /** Idle timeout in ms (default: 5 minutes) */
  idleTimeout?: number;
  /** Cloudflare Worker URL (required for cloudflare provider) */
  workerUrl?: string;
  /** Docker socket path (optional, for docker provider) */
  dockerSocketPath?: string;
  /** Docker host (optional, for docker provider) */
  dockerHost?: string;
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

  // Check for sandbox configuration from environment
  const sandbox = getSandboxConfigFromEnv();

  return {
    port,
    host,
    dataDir: getDataDir(dataDir),
    sandbox,
  };
}

/**
 * Get sandbox configuration from environment variables.
 *
 * Environment variables:
 * - SANDBOX_PROVIDER: "modal", "koyeb", "cloudflare", or "docker"
 * - MODAL_TOKEN_ID + MODAL_TOKEN_SECRET: Modal credentials
 * - KOYEB_API_TOKEN: Koyeb credentials
 * - CLOUDFLARE_SANDBOX_WORKER_URL + CLOUDFLARE_API_TOKEN: Cloudflare credentials
 * - DOCKER_SOCKET_PATH + DOCKER_HOST: Docker connection (optional)
 * - SANDBOX_IMAGE: Docker image (optional)
 * - SANDBOX_INSTANCE_TYPE: Instance size (optional)
 * - SANDBOX_TIMEOUT: Timeout in seconds (optional)
 * - SANDBOX_IDLE_TIMEOUT: Idle timeout in seconds (optional)
 */
function getSandboxConfigFromEnv(): SandboxConfig | undefined {
  const provider = process.env.SANDBOX_PROVIDER as
    | "modal"
    | "koyeb"
    | "cloudflare"
    | "docker"
    | undefined;

  if (!provider) {
    return undefined;
  }

  let apiToken: string | undefined;
  let workerUrl: string | undefined;
  let dockerSocketPath: string | undefined;
  let dockerHost: string | undefined;

  if (provider === "modal") {
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;

    if (!tokenId || !tokenSecret) {
      console.warn(
        "SANDBOX_PROVIDER=modal but MODAL_TOKEN_ID/MODAL_TOKEN_SECRET not set",
      );
      return undefined;
    }

    apiToken = `${tokenId}:${tokenSecret}`;
  } else if (provider === "koyeb") {
    apiToken = process.env.KOYEB_API_TOKEN ?? "";

    if (!apiToken) {
      console.warn("SANDBOX_PROVIDER=koyeb but KOYEB_API_TOKEN not set");
      return undefined;
    }
  } else if (provider === "cloudflare") {
    workerUrl = process.env.CLOUDFLARE_SANDBOX_WORKER_URL;
    apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

    if (!workerUrl) {
      console.warn(
        "SANDBOX_PROVIDER=cloudflare but CLOUDFLARE_SANDBOX_WORKER_URL not set",
      );
      return undefined;
    }
    if (!apiToken) {
      console.warn(
        "SANDBOX_PROVIDER=cloudflare but CLOUDFLARE_API_TOKEN not set",
      );
      return undefined;
    }
  } else if (provider === "docker") {
    // Docker doesn't require API token
    dockerSocketPath = process.env.DOCKER_SOCKET_PATH;
    dockerHost = process.env.DOCKER_HOST;
  } else {
    console.warn(`Unknown SANDBOX_PROVIDER: ${provider}`);
    return undefined;
  }

  return {
    provider,
    apiToken,
    workerUrl,
    dockerSocketPath,
    dockerHost,
    image: process.env.SANDBOX_IMAGE,
    instanceType: process.env.SANDBOX_INSTANCE_TYPE as
      | "nano"
      | "small"
      | "medium"
      | "large"
      | undefined,
    timeout: process.env.SANDBOX_TIMEOUT
      ? parseInt(process.env.SANDBOX_TIMEOUT, 10) * 1000
      : undefined,
    idleTimeout: process.env.SANDBOX_IDLE_TIMEOUT
      ? parseInt(process.env.SANDBOX_IDLE_TIMEOUT, 10) * 1000
      : undefined,
  };
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
  --help, -h              Show this help

Sandbox Mode (for running sessions in isolated containers):
  Set SANDBOX_PROVIDER to enable sandbox mode.

  Environment Variables:
    SANDBOX_PROVIDER              Provider: "modal", "koyeb", "cloudflare", or "docker"
    MODAL_TOKEN_ID                Modal token ID (for modal provider)
    MODAL_TOKEN_SECRET            Modal token secret (for modal provider)
    KOYEB_API_TOKEN               Koyeb API token (for koyeb provider)
    CLOUDFLARE_SANDBOX_WORKER_URL Cloudflare Worker URL (for cloudflare provider)
    CLOUDFLARE_API_TOKEN          Cloudflare API token (for cloudflare provider)
    DOCKER_SOCKET_PATH            Docker socket path (for docker provider, optional)
    DOCKER_HOST                   Docker host URL (for docker provider, optional)
    SANDBOX_IMAGE                 Docker image (default: node:20-slim)
    SANDBOX_INSTANCE_TYPE         Instance size: nano, small, medium, large
    SANDBOX_TIMEOUT               Sandbox timeout in seconds (default: 1800)
    SANDBOX_IDLE_TIMEOUT          Idle timeout in seconds (default: 300)

Data Directory Structure:
  <data-dir>/
    repos.json            Repo definitions
    sessions/             Pi session files + session repos
    state.json            Server state
`);
}
