import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { EnvironmentSandboxConfig } from "../manager";
import type { CreateSandboxOptions } from "../types";

export interface PreparedWorkspace {
  path: string;
  persistent: boolean;
  cleanup?: () => Promise<void>;
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(
        new Error(stderr.trim() || `${command} failed with exit code ${code}`),
      );
    });
  });
}

function withGitHubToken(repoUrl: string, githubToken?: string): string {
  if (!githubToken || !repoUrl.startsWith("https://")) {
    return repoUrl;
  }
  return repoUrl.replace(
    "https://",
    `https://x-access-token:${encodeURIComponent(githubToken)}@`,
  );
}

async function ensureDirectory(path: string, label: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (!info) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (!info.isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

async function ensureGitRepo(path: string): Promise<void> {
  const gitDir = await stat(join(path, ".git")).catch(() => null);
  if (!gitDir) {
    throw new Error(`Not a git repository: ${path}`);
  }
}

async function branchExists(
  repoPath: string,
  branch: string,
): Promise<boolean> {
  return new Promise<boolean>((resolvePromise, reject) => {
    const child = spawn(
      "git",
      ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      {
        cwd: repoPath,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(true);
        return;
      }
      if (code === 1) {
        resolvePromise(false);
        return;
      }
      reject(
        new Error(
          stderr.trim() || `git show-ref failed with exit code ${code}`,
        ),
      );
    });
  });
}

export async function prepareLocalWorkspace(
  sessionDataDir: string,
  envConfig: EnvironmentSandboxConfig,
  options: CreateSandboxOptions,
): Promise<PreparedWorkspace> {
  const mode =
    envConfig.workspaceMode ??
    (options.repoUrl ? "github-clone" : "local-directory");

  if (mode === "local-directory") {
    const localPath = envConfig.localPath;
    if (!localPath) {
      throw new Error("Local environment missing localPath");
    }
    const resolvedPath = resolve(localPath);
    await ensureDirectory(resolvedPath, "Local path");
    return { path: resolvedPath, persistent: true };
  }

  if (mode === "git-worktree") {
    const repoPath = envConfig.worktreeRepoPath;
    if (!repoPath) {
      throw new Error("Local environment missing worktreeRepoPath");
    }

    const resolvedRepoPath = resolve(repoPath);
    await ensureDirectory(resolvedRepoPath, "Worktree repo path");
    await ensureGitRepo(resolvedRepoPath);

    const explicitPath = envConfig.worktreePath?.trim();
    const managedPath = explicitPath
      ? resolve(explicitPath)
      : join(sessionDataDir, options.sessionId, "workspace-worktree");
    await mkdir(dirname(managedPath), { recursive: true });

    const branch =
      envConfig.worktreeBranch ?? `pi-session-${options.sessionId}`;
    const branchProvidedByUser = Boolean(envConfig.worktreeBranch?.trim());
    const addArgs = branchProvidedByUser
      ? ["worktree", "add", managedPath, branch]
      : ["worktree", "add", "-b", branch, managedPath];

    if (
      branchProvidedByUser &&
      !(await branchExists(resolvedRepoPath, branch))
    ) {
      throw new Error(
        `Worktree branch does not exist: ${branch}. Leave it empty to create a session branch automatically.`,
      );
    }

    await runCommand("git", addArgs, resolvedRepoPath);

    return {
      path: managedPath,
      persistent: true,
      cleanup: async () => {
        await runCommand(
          "git",
          ["worktree", "remove", "--force", managedPath],
          resolvedRepoPath,
        ).catch(() => undefined);
        if (!explicitPath) {
          await rm(managedPath, { recursive: true, force: true });
        }
      },
    };
  }

  const repoUrl = envConfig.repoUrl ?? options.repoUrl;
  if (!repoUrl) {
    throw new Error("Local GitHub clone environment requires repoUrl");
  }

  const parentDir = join(sessionDataDir, options.sessionId);
  await mkdir(parentDir, { recursive: true });
  const workspacePath = await mkdtemp(join(parentDir, "workspace-"));
  const cloneUrl = withGitHubToken(repoUrl, options.githubToken);
  const branch = envConfig.repoBranch ?? options.repoBranch;
  const cloneArgs = ["clone"];
  if (branch) {
    cloneArgs.push("--branch", branch);
  }
  cloneArgs.push(cloneUrl, workspacePath);
  await runCommand("git", cloneArgs);

  return {
    path: workspacePath,
    persistent: true,
    cleanup: async () => {
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}
