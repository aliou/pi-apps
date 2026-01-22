/**
 * Repo configuration management.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig, ReposConfig } from "./types";

const DEFAULT_REPOS_CONFIG: ReposConfig = {
  repos: [],
};

/**
 * Load repos configuration from data directory.
 */
export function loadRepos(dataDir: string): ReposConfig {
  const configPath = join(dataDir, "repos.json");

  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(DEFAULT_REPOS_CONFIG, null, 2));
    return DEFAULT_REPOS_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ReposConfig;
  } catch (error) {
    console.error(`Failed to load repos.json: ${error}`);
    return DEFAULT_REPOS_CONFIG;
  }
}

/**
 * Save repos configuration to data directory.
 */
export function saveRepos(dataDir: string, config: ReposConfig): void {
  const configPath = join(dataDir, "repos.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Get a repo by ID (optionally scoped to a session).
 */
export function getRepo(
  dataDir: string,
  repoId: string,
  sessionId?: string,
): RepoConfig | undefined {
  const config = loadRepos(dataDir);
  return config.repos.find((repo) => {
    if (sessionId && repo.sessionId) {
      return repo.id === repoId && repo.sessionId === sessionId;
    }
    return repo.id === repoId;
  });
}

/**
 * Insert or update a repo entry.
 */
export function upsertRepo(dataDir: string, repo: RepoConfig): RepoConfig {
  const config = loadRepos(dataDir);
  const index = config.repos.findIndex((existing) => {
    if (repo.sessionId && existing.sessionId) {
      return existing.id === repo.id && existing.sessionId === repo.sessionId;
    }
    return existing.id === repo.id;
  });

  if (index >= 0) {
    config.repos[index] = repo;
  } else {
    config.repos.push(repo);
  }

  saveRepos(dataDir, config);
  return repo;
}

/**
 * Validate that a repo path exists and is a git repository.
 */
export function validateRepo(repo: RepoConfig): {
  valid: boolean;
  error?: string;
} {
  if (!existsSync(repo.path)) {
    return { valid: false, error: `Path does not exist: ${repo.path}` };
  }

  const gitDir = join(repo.path, ".git");
  if (!existsSync(gitDir)) {
    return { valid: false, error: `Not a git repository: ${repo.path}` };
  }

  return { valid: true };
}
