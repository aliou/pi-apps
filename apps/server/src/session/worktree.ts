/**
 * Git worktree management for session isolation.
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execaCommand } from "execa";

/**
 * Run a git command and return stdout.
 */
async function git(cwd: string, args: string): Promise<string> {
  const { stdout } = await execaCommand(`git -C ${cwd} ${args}`);
  return stdout;
}

/**
 * Create a git worktree for a session.
 * Returns the path to the worktree.
 */
export async function createWorktree(
  repoPath: string,
  worktreesDir: string,
  sessionId: string,
): Promise<string> {
  const worktreeName = `wt-${sessionId}`;
  const worktreePath = join(worktreesDir, worktreeName);

  if (existsSync(worktreePath)) {
    // Worktree already exists, return it
    return worktreePath;
  }

  try {
    // Get current commit
    const commit = (await git(repoPath, "rev-parse HEAD")).trim();

    // Create worktree with detached HEAD at current commit
    // This avoids branch conflicts
    await git(repoPath, `worktree add --detach ${worktreePath} ${commit}`);

    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree: ${error}`);
  }
}

/**
 * Delete a git worktree.
 */
export async function deleteWorktree(repoPath: string, worktreePath: string): Promise<void> {
  if (!existsSync(worktreePath)) {
    return;
  }

  try {
    // Remove worktree from git
    await git(repoPath, `worktree remove ${worktreePath} --force`);
  } catch (error) {
    // If git worktree remove fails, try manual cleanup
    console.warn(`git worktree remove failed, cleaning up manually: ${error}`);
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      // Prune worktree references
      await git(repoPath, "worktree prune");
    } catch (cleanupError) {
      console.error(`Manual cleanup failed: ${cleanupError}`);
    }
  }
}

/**
 * List all worktrees for a repo.
 */
export async function listWorktrees(repoPath: string): Promise<string[]> {
  try {
    const result = await git(repoPath, "worktree list --porcelain");
    const worktrees: string[] = [];

    for (const line of result.split("\n")) {
      if (line.startsWith("worktree ")) {
        worktrees.push(line.slice("worktree ".length));
      }
    }

    return worktrees;
  } catch (error) {
    console.error(`Failed to list worktrees: ${error}`);
    return [];
  }
}
