import type { GitHubAppService, GitHubAppStatus } from "./github-app.service";

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

export type GitAuthMode = "pat" | "github_app";

export interface GitActorIdentity {
  name: string;
  email: string;
}

export interface GitAuthContext {
  mode: GitAuthMode;
  getRepoAccessToken(repoFullName: string): Promise<string>;
  getActorIdentity(repoFullName?: string): Promise<GitActorIdentity>;
}

export interface GitAuthStatus {
  app: GitHubAppStatus;
  pat: {
    configured: boolean;
    valid?: boolean;
    user?: string;
    error?: string;
  };
  preferredMode: GitAuthMode | "none";
}

interface GitHubServiceOptions {
  githubAppService?: GitHubAppService;
  getPat?: () => string | undefined;
}

interface ResolvedRepoAuth {
  mode: GitAuthMode;
  token: string;
  identity: GitActorIdentity;
}

export class GitHubService {
  private githubAppService?: GitHubAppService;
  private getPat?: () => string | undefined;

  constructor(options: GitHubServiceOptions = {}) {
    this.githubAppService = options.githubAppService;
    this.getPat = options.getPat;
  }

  async getAuthStatus(): Promise<GitAuthStatus> {
    const app = this.githubAppService
      ? await this.githubAppService.getStatus()
      : {
          configured: false,
          hasPrivateKey: false,
          hasWebhookSecret: false,
          installationIds: [],
        };

    const pat = this.getPat?.();
    if (!pat) {
      return {
        app,
        pat: { configured: false },
        preferredMode: app.configured ? "github_app" : "none",
      };
    }

    const info = await this.validateToken(pat);
    return {
      app,
      pat: {
        configured: true,
        valid: info.valid,
        user: info.user,
        error: info.error,
      },
      preferredMode: app.configured ? "github_app" : "pat",
    };
  }

  async getAuthContext(repoFullName?: string): Promise<GitAuthContext> {
    const resolved = await this.resolveRepoAuth(repoFullName);

    return {
      mode: resolved.mode,
      getRepoAccessToken: async (nextRepoFullName: string) => {
        if (repoFullName && nextRepoFullName === repoFullName) {
          return resolved.token;
        }
        return (await this.resolveRepoAuth(nextRepoFullName)).token;
      },
      getActorIdentity: async () => resolved.identity,
    };
  }

  async listAccessibleRepos(): Promise<{
    mode: GitAuthMode;
    repos: GitHubRepo[];
  }> {
    if (this.githubAppService) {
      const appStatus = await this.githubAppService.getStatus();
      if (appStatus.configured) {
        try {
          const repos = await this.listAppRepos();
          return { mode: "github_app", repos };
        } catch (err) {
          const pat = this.getPat?.();
          if (!pat) {
            throw err;
          }
        }
      }
    }

    const pat = this.getPat?.();
    if (!pat) {
      throw new Error(
        "GitHub auth not configured. Connect a GitHub App or add a Personal Access Token.",
      );
    }

    return {
      mode: "pat",
      repos: await this.listRepos(pat),
    };
  }

  async getRepoByIdUsingConfiguredAuth(id: string): Promise<GitHubRepo> {
    if (this.githubAppService) {
      const appStatus = await this.githubAppService.getStatus();
      if (appStatus.configured) {
        const repos = await this.listAppRepos();
        const repo = repos.find((candidate) => String(candidate.id) === id);
        if (repo) {
          return repo;
        }
      }
    }

    const pat = this.getPat?.();
    if (!pat) {
      throw new Error(
        "Could not resolve repository via GitHub App and no PAT fallback is configured.",
      );
    }

    return this.getRepoById(pat, id);
  }

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

  async getRepoById(token: string, id: string): Promise<GitHubRepo> {
    const response = await fetch(`${API_BASE}/repositories/${id}`, {
      headers: this.headers(token),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub API error: ${response.status} ${text}`);
    }

    const repo = (await response.json()) as Record<string, unknown>;
    return this.mapRepo(repo);
  }

  private async resolveRepoAuth(
    repoFullName?: string,
  ): Promise<ResolvedRepoAuth> {
    let appError: Error | null = null;

    if (this.githubAppService) {
      const appStatus = await this.githubAppService.getStatus();
      if (appStatus.configured && repoFullName) {
        try {
          const access =
            await this.githubAppService.getRepoAccessToken(repoFullName);
          return {
            mode: "github_app",
            token: access.token,
            identity: await this.githubAppService.getActorIdentity(),
          };
        } catch (err) {
          appError = err instanceof Error ? err : new Error(String(err));
        }
      }
    }

    const pat = this.getPat?.();
    if (pat) {
      return {
        mode: "pat",
        token: pat,
        identity: await this.getPatActorIdentity(pat),
      };
    }

    if (appError) {
      throw new Error(
        `${appError.message} PAT fallback is not configured, so the operation cannot continue.`,
      );
    }

    throw new Error(
      "GitHub auth not configured. Connect a GitHub App or add a Personal Access Token.",
    );
  }

  private async getPatActorIdentity(token: string): Promise<GitActorIdentity> {
    const info = await this.validateToken(token);
    const login = info.user?.trim();
    if (!login) {
      return {
        name: "pi-sandbox",
        email: "pi-sandbox@noreply.github.com",
      };
    }

    return {
      name: login,
      email: `${login}@users.noreply.github.com`,
    };
  }

  private async listAppRepos(): Promise<GitHubRepo[]> {
    if (!this.githubAppService) {
      return [];
    }

    const repos = new Map<string, GitHubRepo>();
    const installations = await this.githubAppService.listInstallations();

    for (const installation of installations) {
      const token = await this.githubAppService.getInstallationTokenForId(
        installation.id,
      );
      const installationRepos = await this.listInstallationRepos(token.token);
      for (const repo of installationRepos) {
        repos.set(repo.fullName, repo);
      }
    }

    return [...repos.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }

  async listInstallationRepos(token: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = [];
    let url: string | null =
      `${API_BASE}/installation/repositories?per_page=${PER_PAGE}`;

    while (url) {
      const response = await fetch(url, {
        headers: this.headers(token),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub API error: ${response.status} ${text}`);
      }

      const page = (await response.json()) as {
        repositories?: Array<Record<string, unknown>>;
      };
      for (const repo of page.repositories ?? []) {
        repos.push(this.mapRepo(repo));
      }

      url = this.getNextLink(response.headers.get("link"));
    }

    return repos;
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
