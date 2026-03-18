import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { createLogger } from "../lib/logger";
import { hasAssets } from "../sandbox/gondolin/paths";
import type { EnvironmentSandboxConfig } from "../sandbox/manager";
import {
  AVAILABLE_DOCKER_IMAGES,
  type EnvironmentConfig,
  type SandboxType,
  SYSTEM_LOCAL_ENV_NAME,
} from "../services/environment.service";

interface CreateEnvironmentRequest {
  name: string;
  sandboxType: SandboxType;
  config: EnvironmentConfig;
  isDefault?: boolean;
}

interface UpdateEnvironmentRequest {
  name?: string;
  sandboxType?: SandboxType;
  config?: EnvironmentConfig;
  isDefault?: boolean;
}

interface GondolinMetadataResponse {
  defaultInstallBaseDir: string;
  installCommand: string;
  checkedPath: string;
  assetsExist: boolean;
  installedAssetDirs: string[];
}

const ENV_VAR_KEY_RE = /^[A-Z_][A-Z0-9_]*$/;

function toSandboxConfig(
  sandboxType: SandboxType,
  config: EnvironmentConfig,
  apiToken?: string,
): EnvironmentSandboxConfig {
  return {
    sandboxType,
    image: config.image,
    workerUrl: config.workerUrl,
    apiToken,
    imagePath: config.imagePath,
    workspaceMode: config.workspaceMode,
    repoUrl: config.repoUrl,
    repoBranch: config.repoBranch,
    localPath: config.localPath,
    worktreeRepoPath: config.worktreeRepoPath,
    worktreePath: config.worktreePath,
    worktreeBranch: config.worktreeBranch,
    systemManaged: config.systemManaged,
    env: config.envVars
      ? Object.fromEntries(
          config.envVars.map((entry) => [entry.key, entry.value]),
        )
      : undefined,
  };
}

function validateEnvVars(envVars: EnvironmentConfig["envVars"]): string | null {
  if (envVars === undefined) return null;
  if (!Array.isArray(envVars))
    return "config.envVars must be an array when provided";

  const seen = new Set<string>();
  for (const [index, entry] of envVars.entries()) {
    if (!entry || typeof entry !== "object")
      return `config.envVars[${index}] must be an object`;
    if (typeof entry.key !== "string" || !entry.key.trim())
      return `config.envVars[${index}].key is required`;
    if (!ENV_VAR_KEY_RE.test(entry.key.trim()))
      return `Invalid env var key: ${entry.key}`;
    if (typeof entry.value !== "string")
      return `config.envVars[${index}].value must be a string`;
    const key = entry.key.trim();
    if (seen.has(key)) return `Duplicate env var key: ${key}`;
    seen.add(key);
  }

  return null;
}

function normalizeConfig(config: EnvironmentConfig): EnvironmentConfig {
  return {
    ...config,
    envVars: config.envVars
      ?.map((entry) => ({ key: entry.key.trim(), value: entry.value }))
      .filter((entry) => entry.key.length > 0),
    repoUrl: config.repoUrl?.trim(),
    repoBranch: config.repoBranch?.trim(),
    localPath: config.localPath?.trim(),
    worktreeRepoPath: config.worktreeRepoPath?.trim(),
    worktreePath: config.worktreePath?.trim(),
    worktreeBranch: config.worktreeBranch?.trim(),
    workspaceMode:
      config.workspaceMode ??
      (config.localPath ? "local-directory" : undefined),
  };
}

async function pathMustBeDirectory(
  path: string,
  label: string,
): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return `${label} must be a directory`;
    return null;
  } catch {
    return `${label} does not exist`;
  }
}

async function validateConfig(
  sandboxType: SandboxType,
  config: EnvironmentConfig,
): Promise<string | null> {
  if (sandboxType === "docker") {
    if (!config.image)
      return "config.image is required for docker environments";
    const stripTag = (value: string) => value.replace(/:[\w.-]+$/, "");
    const validBases = AVAILABLE_DOCKER_IMAGES.map((img) =>
      stripTag(img.image),
    );
    if (!validBases.includes(stripTag(config.image))) {
      return `Invalid image. Must be one of: ${AVAILABLE_DOCKER_IMAGES.map((img) => img.image).join(", ")}`;
    }
  } else if (sandboxType === "cloudflare") {
    if (!config.workerUrl)
      return "config.workerUrl is required for cloudflare environments";
    try {
      new URL(config.workerUrl);
    } catch {
      return "config.workerUrl must be a valid URL";
    }
    if (!config.secretId) {
      return "config.secretId is required for cloudflare environments (shared secret for Worker auth)";
    }
  } else if (sandboxType === "gondolin") {
    if (
      config.imagePath !== undefined &&
      typeof config.imagePath !== "string"
    ) {
      return "config.imagePath must be a string when provided";
    }
  } else if (sandboxType === "local") {
    const mode = config.workspaceMode;
    if (!mode) return "config.workspaceMode is required for local environments";
    if (mode === "github-clone") {
      if (!config.repoUrl)
        return "config.repoUrl is required for local github-clone mode";
      try {
        new URL(config.repoUrl);
      } catch {
        return "config.repoUrl must be a valid URL";
      }
    } else if (mode === "local-directory") {
      if (!config.localPath)
        return "config.localPath is required for local-directory mode";
      if (!isAbsolute(config.localPath))
        return "config.localPath must be an absolute path";
      return (
        (await pathMustBeDirectory(config.localPath, "config.localPath")) ??
        validateEnvVars(config.envVars)
      );
    } else if (mode === "git-worktree") {
      if (!config.worktreeRepoPath)
        return "config.worktreeRepoPath is required for git-worktree mode";
      if (!isAbsolute(config.worktreeRepoPath))
        return "config.worktreeRepoPath must be an absolute path";
      const pathError = await pathMustBeDirectory(
        config.worktreeRepoPath,
        "config.worktreeRepoPath",
      );
      if (pathError) return pathError;
      if (config.worktreePath && !isAbsolute(config.worktreePath)) {
        return "config.worktreePath must be an absolute path when provided";
      }
    }
  }

  if (config.idleTimeoutSeconds !== undefined) {
    if (
      !Number.isInteger(config.idleTimeoutSeconds) ||
      config.idleTimeoutSeconds < 60 ||
      config.idleTimeoutSeconds > 86400
    ) {
      return "config.idleTimeoutSeconds must be an integer between 60 and 86400";
    }
  }

  return validateEnvVars(config.envVars);
}

function getRelayCacheDir(): string {
  return process.env.PI_RELAY_CACHE_DIR
    ? resolve(process.env.PI_RELAY_CACHE_DIR)
    : resolve(process.cwd(), ".dev", "relay", "cache");
}

function getDefaultGondolinInstallBaseDir(): string {
  return resolve(getRelayCacheDir(), "gondolin-custom");
}

function buildInstallCommand(dest: string): string {
  return `pnpm exec tsx server/scripts/install-gondolin-assets.ts --release latest --dest ${JSON.stringify(dest)}`;
}

function assertAllowedInstallBase(dest: string): string | null {
  const baseDir = getDefaultGondolinInstallBaseDir();
  const resolved = resolve(dest);
  const rel = relative(baseDir, resolved);
  if (rel === "") return null;
  if (rel.startsWith("..") || rel === "..")
    return `Destination must stay within ${baseDir}`;
  return null;
}

async function listInstalledAssetDirs(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(baseDir, entry.name))
    .filter((dir) => hasAssets(dir))
    .sort((a, b) => b.localeCompare(a));
}

export function environmentsRoutes(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const logger = createLogger("environments");

  app.get("/images", (c) =>
    c.json({ data: AVAILABLE_DOCKER_IMAGES, error: null }),
  );

  app.get("/gondolin", async (c) => {
    const requestedPath = c.req.query("imagePath")?.trim();
    const defaultInstallBaseDir = getDefaultGondolinInstallBaseDir();
    const installedAssetDirs = await listInstalledAssetDirs(
      defaultInstallBaseDir,
    );
    const checkedPath = requestedPath
      ? resolve(requestedPath)
      : (installedAssetDirs[0] ?? defaultInstallBaseDir);

    const data: GondolinMetadataResponse = {
      defaultInstallBaseDir,
      installCommand: buildInstallCommand(defaultInstallBaseDir),
      checkedPath,
      assetsExist: hasAssets(checkedPath),
      installedAssetDirs,
    };

    return c.json({ data, error: null });
  });

  app.post("/gondolin/install", async (c) => {
    let body: { destination?: string; release?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const destination = resolve(
      body.destination?.trim() || getDefaultGondolinInstallBaseDir(),
    );
    const destinationError = assertAllowedInstallBase(destination);
    if (destinationError)
      return c.json({ data: null, error: destinationError }, 400);

    await mkdir(destination, { recursive: true });

    const scriptPath = resolve(
      process.cwd(),
      "..",
      "scripts",
      "install-gondolin-assets.ts",
    );
    const command = [
      "exec",
      "tsx",
      scriptPath,
      "--release",
      body.release?.trim() || "latest",
      "--dest",
      destination,
    ];

    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolvePromise) => {
      const child = spawn("pnpm", command, {
        cwd: resolve(process.cwd(), ".."),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (exitCode) =>
        resolvePromise({ exitCode, stdout, stderr }),
      );
      child.on("error", (error) =>
        resolvePromise({ exitCode: 1, stdout, stderr: error.message }),
      );
    });

    if (result.exitCode !== 0) {
      logger.error({ destination, ...result }, "gondolin asset install failed");
      return c.json(
        {
          data: null,
          error: result.stderr || "Failed to install Gondolin assets",
        },
        500,
      );
    }

    let parsedOutput: { destination?: string } | null = null;
    try {
      parsedOutput = JSON.parse(result.stdout);
    } catch {
      parsedOutput = null;
    }

    return c.json({
      data: {
        ok: true,
        destination: parsedOutput?.destination ?? destination,
        output: result.stdout,
      },
      error: null,
    });
  });

  app.post("/probe", async (c) => {
    const sandboxManager = c.get("sandboxManager");

    let body: { sandboxType: SandboxType; config: EnvironmentConfig };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const validTypes: SandboxType[] = [
      "docker",
      "cloudflare",
      "gondolin",
      "local",
    ];
    if (!body.sandboxType || !validTypes.includes(body.sandboxType)) {
      return c.json(
        {
          data: null,
          error: `sandboxType must be one of: ${validTypes.join(", ")}`,
        },
        400,
      );
    }

    const normalizedConfig = normalizeConfig(body.config ?? {});
    const configError = await validateConfig(
      body.sandboxType,
      normalizedConfig,
    );
    if (configError) return c.json({ data: null, error: configError }, 400);

    try {
      let apiToken: string | undefined;
      if (body.sandboxType === "cloudflare" && normalizedConfig.secretId) {
        const secretsService = c.get("secretsService");
        const value = await secretsService.getValue(normalizedConfig.secretId);
        if (!value) {
          return c.json({
            data: { available: false, error: "Referenced secret not found" },
            error: null,
          });
        }
        apiToken = value;
      }

      const envConfig = toSandboxConfig(
        body.sandboxType,
        normalizedConfig,
        apiToken,
      );
      const available = await sandboxManager.isProviderAvailable(envConfig);
      return c.json({
        data: { available, sandboxType: body.sandboxType },
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Probe failed";
      return c.json({
        data: { available: false, error: message },
        error: null,
      });
    }
  });

  app.get("/", (c) => {
    const environmentService = c.get("environmentService");
    const envs = environmentService.list();
    return c.json({
      data: envs.map((env) => ({ ...env, config: JSON.parse(env.config) })),
      error: null,
    });
  });

  app.post("/", async (c) => {
    const environmentService = c.get("environmentService");

    let body: CreateEnvironmentRequest;
    try {
      body = await c.req.json<CreateEnvironmentRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    if (!body.name?.trim())
      return c.json({ data: null, error: "name is required" }, 400);

    const validSandboxTypes: SandboxType[] = [
      "docker",
      "cloudflare",
      "gondolin",
      "local",
    ];
    if (!body.sandboxType || !validSandboxTypes.includes(body.sandboxType)) {
      return c.json(
        {
          data: null,
          error: `sandboxType must be one of: ${validSandboxTypes.join(", ")}`,
        },
        400,
      );
    }
    if (body.sandboxType === "local") {
      return c.json(
        {
          data: null,
          error: "Local environment is built-in and cannot be created manually",
        },
        400,
      );
    }

    const normalizedConfig = normalizeConfig(body.config ?? {});
    const configError = await validateConfig(
      body.sandboxType,
      normalizedConfig,
    );
    if (configError) return c.json({ data: null, error: configError }, 400);

    try {
      const configToStore = { ...normalizedConfig };
      if (body.sandboxType === "cloudflare") {
        configToStore.idleTimeoutSeconds = 3600;
      } else if (configToStore.idleTimeoutSeconds === undefined) {
        configToStore.idleTimeoutSeconds = 3600;
      }

      const env = environmentService.create({
        name: body.name.trim(),
        sandboxType: body.sandboxType,
        config: configToStore,
        isDefault: body.isDefault,
      });
      return c.json({
        data: { ...env, config: JSON.parse(env.config) },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, "failed to create environment");
      const message =
        err instanceof Error ? err.message : "Failed to create environment";
      return c.json({ data: null, error: message }, 500);
    }
  });

  app.get("/:id", (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");
    const env = environmentService.get(id);
    if (!env)
      return c.json({ data: null, error: "Environment not found" }, 404);
    return c.json({
      data: { ...env, config: JSON.parse(env.config) },
      error: null,
    });
  });

  app.put("/:id", async (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");
    const existing = environmentService.get(id);
    if (!existing)
      return c.json({ data: null, error: "Environment not found" }, 404);

    let body: UpdateEnvironmentRequest;
    try {
      body = await c.req.json<UpdateEnvironmentRequest>();
    } catch {
      return c.json({ data: null, error: "Invalid JSON body" }, 400);
    }

    const existingConfig = JSON.parse(existing.config) as EnvironmentConfig;
    const requestedSandboxType =
      body.sandboxType ?? (existing.sandboxType as SandboxType);
    if (existing.sandboxType === "local" && requestedSandboxType !== "local") {
      return c.json(
        {
          data: null,
          error: "Built-in local environment cannot change sandboxType",
        },
        400,
      );
    }
    if (existing.sandboxType !== "local" && requestedSandboxType === "local") {
      return c.json(
        {
          data: null,
          error:
            "Local environment is built-in and cannot be converted from another type",
        },
        400,
      );
    }

    const normalizedConfig = body.config
      ? normalizeConfig({
          ...existingConfig,
          ...body.config,
          systemManaged: existingConfig.systemManaged,
        })
      : undefined;
    if (normalizedConfig) {
      const configError = await validateConfig(
        requestedSandboxType,
        normalizedConfig,
      );
      if (configError) return c.json({ data: null, error: configError }, 400);
    }

    try {
      let configToUpdate = normalizedConfig;
      if (configToUpdate && requestedSandboxType === "cloudflare") {
        const { idleTimeoutSeconds: _, ...rest } = configToUpdate;
        configToUpdate = rest;
      }

      environmentService.update(id, {
        name:
          existing.sandboxType === "local"
            ? SYSTEM_LOCAL_ENV_NAME
            : body.name?.trim(),
        config: configToUpdate,
        isDefault: body.isDefault,
      });

      const updated = environmentService.get(id);
      return c.json({
        data: updated
          ? { ...updated, config: JSON.parse(updated.config) }
          : null,
        error: null,
      });
    } catch (err) {
      logger.error({ err, environmentId: id }, "failed to update environment");
      const message =
        err instanceof Error ? err.message : "Failed to update environment";
      return c.json({ data: null, error: message }, 500);
    }
  });

  app.delete("/:id", (c) => {
    const environmentService = c.get("environmentService");
    const id = c.req.param("id");
    const existing = environmentService.get(id);
    if (!existing)
      return c.json({ data: null, error: "Environment not found" }, 404);

    try {
      environmentService.delete(id);
      return c.json({ data: { ok: true }, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete environment";
      return c.json({ data: null, error: message }, 400);
    }
  });

  return app;
}
