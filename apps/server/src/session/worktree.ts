/**
 * Git worktree management for session isolation.
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

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
    // Get current branch/HEAD
    const headResult =
      await $`git -C ${repoPath} rev-parse --abbrev-ref HEAD`.text();
    const _branch = headResult.trim();

    // Create worktree with detached HEAD at current commit
    // This avoids branch conflicts
    const commitResult = await $`git -C ${repoPath} rev-parse HEAD`.text();
    const commit = commitResult.trim();

    await $`git -C ${repoPath} worktree add --detach ${worktreePath} ${commit}`;

    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree: ${error}`);
  }
}

/**
 * Delete a git worktree.
 */
export async function deleteWorktree(
  repoPath: string,
  worktreePath: string,
): Promise<void> {
  if (!existsSync(worktreePath)) {
    return;
  }

  try {
    // Remove worktree from git
    await $`git -C ${repoPath} worktree remove ${worktreePath} --force`;
  } catch (error) {
    // If git worktree remove fails, try manual cleanup
    console.warn(`git worktree remove failed, cleaning up manually: ${error}`);
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      // Prune worktree references
      await $`git -C ${repoPath} worktree prune`;
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
    const result = await $`git -C ${repoPath} worktree list --porcelain`.text();
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
