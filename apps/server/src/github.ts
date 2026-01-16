/**
 * GitHub API helpers.
 */

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  description?: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
}

const API_BASE = "https://api.github.com";
const PER_PAGE = 100;

export function getGitHubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN not set");
  }
  return token;
}

export async function listAccessibleRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let url = `${API_BASE}/user/repos?per_page=${PER_PAGE}&affiliation=owner,collaborator,organization_member&sort=full_name`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "pi-server",
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }

    const page = (await response.json()) as Array<Record<string, unknown>>;
    for (const repo of page) {
      repos.push(mapRepo(repo));
    }

    url = getNextLink(response.headers.get("link"));
  }

  return repos;
}

export async function getRepoByFullName(
  token: string,
  fullName: string,
): Promise<GitHubRepo> {
  const response = await fetch(`${API_BASE}/repos/${fullName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "pi-server",
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${text}`);
  }

  const repo = (await response.json()) as Record<string, unknown>;
  return mapRepo(repo);
}

function mapRepo(repo: Record<string, unknown>): GitHubRepo {
  return {
    id: Number(repo.id),
    name: String(repo.name ?? ""),
    fullName: String(repo.full_name ?? ""),
    owner: String((repo.owner as Record<string, unknown> | undefined)?.login ?? ""),
    private: Boolean(repo.private),
    description: repo.description ? String(repo.description) : undefined,
    htmlUrl: String(repo.html_url ?? ""),
    cloneUrl: String(repo.clone_url ?? ""),
    sshUrl: String(repo.ssh_url ?? ""),
    defaultBranch: String(repo.default_branch ?? "main"),
  };
}

function getNextLink(linkHeader: string | null): string {
  if (!linkHeader) return "";

  const links = linkHeader.split(",");
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}
