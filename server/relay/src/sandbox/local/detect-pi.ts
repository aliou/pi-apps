import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PiDetectionResult {
  available: boolean;
  path?: string;
  version?: string;
  error?: string;
}

async function findExecutableInPath(name: string): Promise<string | null> {
  const pathEnv = process.env.PATH;
  if (!pathEnv) return null;

  for (const entry of pathEnv.split(delimiter)) {
    const candidate = `${entry}/${name}`;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // continue
    }
  }

  return null;
}

async function validatePiBinary(
  binaryPath: string,
): Promise<PiDetectionResult> {
  try {
    await access(binaryPath, constants.X_OK);
  } catch {
    return {
      available: false,
      error:
        process.env.PI_BIN_PATH !== undefined
          ? "PI_BIN_PATH is invalid or does not point to a working pi binary"
          : `pi binary is not executable: ${binaryPath}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, ["--version"], {
      timeout: 10_000,
      env: process.env,
    });
    const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
    return {
      available: true,
      path: binaryPath,
      version: output || undefined,
    };
  } catch {
    return {
      available: false,
      path: binaryPath,
      error:
        process.env.PI_BIN_PATH !== undefined
          ? "PI_BIN_PATH is invalid or does not point to a working pi binary"
          : "Found pi in PATH, but `pi --version` failed",
    };
  }
}

export async function detectPiBinary(): Promise<PiDetectionResult> {
  const configuredPath = process.env.PI_BIN_PATH?.trim();
  if (configuredPath) {
    return validatePiBinary(configuredPath);
  }

  const pathBinary = await findExecutableInPath("pi");
  if (!pathBinary) {
    return {
      available: false,
      error: "pi not found in PATH",
    };
  }

  return validatePiBinary(pathBinary);
}
