/**
 * Session-scoped repo cloning and cleanup.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { $ } from "bun";

export interface CloneOptions {
  repoPath: string;
  cloneUrl: string;
  defaultBranch: string;
  sessionId: string;
}

export async function ensureSessionRepo(
  options: CloneOptions,
): Promise<{ repoPath: string; branchName: string }> {
  const { repoPath, cloneUrl, defaultBranch, sessionId } = options;
  const branchName = `pi/session-${sessionId}`;

  if (!existsSync(repoPath)) {
    mkdirSync(dirname(repoPath), { recursive: true });
    await $`git clone --branch ${defaultBranch} --single-branch ${cloneUrl} ${repoPath}`;
  }

  await $`git -C ${repoPath} checkout -B ${branchName}`;

  return { repoPath, branchName };
}

export function deleteSessionRepo(repoPath: string): void {
  if (!existsSync(repoPath)) {
    return;
  }

  rmSync(repoPath, { recursive: true, force: true });
}

export function buildAuthedCloneUrl(cloneUrl: string, token: string): string {
  try {
    const url = new URL(cloneUrl);
    if (url.protocol !== "https:") {
      return cloneUrl;
    }

    url.username = "x-access-token";
    url.password = token;
    return url.toString();
  } catch {
    return cloneUrl;
  }
}
