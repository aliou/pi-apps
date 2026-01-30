const API_BASE = "https://api.github.com";
const PER_PAGE = 100;

export interface GitHubTokenInfo {
  valid: boolean;
  user?: string;
  scopes?: string[];
  rateLimitRemaining?: number;
  error?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  description?: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
}

export class GitHubService {
  /**
   * Validate a GitHub PAT.
   * Calls GET /user and checks response.
   */
  async validateToken(token: string): Promise<GitHubTokenInfo> {
    try {
      const response = await fetch(`${API_BASE}/user`, {
        headers: this.headers(token),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: "Invalid token" };
        }
        const text = await response.text();
        return {
          valid: false,
          error: `GitHub API error: ${response.status} ${text}`,
        };
      }

      const user = (await response.json()) as { login: string };
      const scopesHeader = response.headers.get("x-oauth-scopes");
      const rateLimitHeader = response.headers.get("x-ratelimit-remaining");

      return {
        valid: true,
        user: user.login,
        scopes: scopesHeader ? scopesHeader.split(", ").filter(Boolean) : [],
        rateLimitRemaining: rateLimitHeader
          ? parseInt(rateLimitHeader, 10)
          : undefined,
      };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * List repos accessible to the token.
   * Paginates through all results.
   */
  async listRepos(token: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let url: string | null =
      `${API_BASE}/user/repos?per_page=${PER_PAGE}&affiliation=owner,collaborator,organization_member&sort=full_name`;

    while (url) {
      const response = await fetch(url, {
        headers: this.headers(token),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${text}`);
      }

      const page = (await response.json()) as Array<Record<string, unknown>>;
      for (const repo of page) {
        repos.push(this.mapRepo(repo));
      }

      url = this.getNextLink(response.headers.get("link"));
    }

    return repos;
  }

  /**
   * Get a single repo by full name (owner/repo).
   */
  async getRepo(token: string, fullName: string): Promise<GitHubRepo> {
    const response = await fetch(`${API_BASE}/repos/${fullName}`, {
      headers: this.headers(token),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }

    const repo = (await response.json()) as Record<string, unknown>;
    return this.mapRepo(repo);
  }

  private headers(token: string): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      "User-Agent": "pi-relay",
      Accept: "application/vnd.github+json",
    };
  }

  private mapRepo(repo: Record<string, unknown>): GitHubRepo {
    return {
      id: Number(repo.id),
      name: String(repo.name ?? ""),
      fullName: String(repo.full_name ?? ""),
      owner: String(
        (repo.owner as Record<string, unknown> | undefined)?.login ?? "",
      ),
      isPrivate: Boolean(repo.private),
      description: repo.description ? String(repo.description) : undefined,
      htmlUrl: String(repo.html_url ?? ""),
      cloneUrl: String(repo.clone_url ?? ""),
      sshUrl: String(repo.ssh_url ?? ""),
      defaultBranch: String(repo.default_branch ?? "main"),
    };
  }

  private getNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(",");
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }
}
