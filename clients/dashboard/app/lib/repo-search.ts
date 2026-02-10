import type { GitHubRepo } from "./api";

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function subsequenceScore(text: string, query: string): number {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i += 1) {
    if (text[i] === query[qi]) qi += 1;
  }
  if (qi !== query.length) return -1;
  return Math.max(1, query.length / Math.max(1, text.length));
}

function rankText(text: string, query: string): number {
  if (!text) return -1;
  if (text === query) return 120;
  if (text.startsWith(query)) return 100;

  const wordBoundary = text.indexOf(` ${query}`);
  if (wordBoundary >= 0) return 85;

  const includesAt = text.indexOf(query);
  if (includesAt >= 0) return 70 - Math.min(includesAt, 30);

  const subseq = subsequenceScore(text, query);
  if (subseq >= 0) return 40 + subseq * 20;

  return -1;
}

function rankRepo(repo: GitHubRepo, query: string): number {
  const fullName = normalize(repo.fullName);
  const name = normalize(repo.name);
  const owner = normalize(repo.owner);
  const description = normalize(repo.description ?? "");

  const scores = [
    rankText(fullName, query),
    rankText(name, query) - 2,
    rankText(owner, query) - 8,
    rankText(description, query) - 12,
  ];

  return Math.max(...scores);
}

export function fuzzyFilterRepos(repos: GitHubRepo[], query: string): GitHubRepo[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return repos;

  return repos
    .map((repo) => ({ repo, score: rankRepo(repo, normalizedQuery) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.repo.fullName.localeCompare(b.repo.fullName))
    .map((item) => item.repo);
}
