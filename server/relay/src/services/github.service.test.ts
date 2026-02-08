import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubService } from "./github.service";

describe("GitHubService", () => {
  let service: GitHubService;

  beforeEach(() => {
    service = new GitHubService();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("validateToken", () => {
    it("returns valid info for good token", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: "testuser" }),
        headers: new Headers({
          "x-oauth-scopes": "repo, user",
          "x-ratelimit-remaining": "4999",
        }),
      } as Response);

      const result = await service.validateToken("ghp_valid");

      expect(result.valid).toBe(true);
      expect(result.user).toBe("testuser");
      expect(result.scopes).toContain("repo");
      expect(result.scopes).toContain("user");
      expect(result.rateLimitRemaining).toBe(4999);
    });

    it("returns invalid for 401 response", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Bad credentials",
      } as Response);

      const result = await service.validateToken("ghp_invalid");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid token");
    });

    it("returns invalid for other error responses", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      } as Response);

      const result = await service.validateToken("ghp_test");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("500");
    });

    it("handles network errors", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await service.validateToken("ghp_test");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("handles empty scopes header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: "testuser" }),
        headers: new Headers({}),
      } as Response);

      const result = await service.validateToken("ghp_valid");

      expect(result.valid).toBe(true);
      expect(result.scopes).toEqual([]);
    });
  });

  describe("listRepos", () => {
    it("returns repos from single page", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            name: "repo1",
            full_name: "owner/repo1",
            owner: { login: "owner" },
            private: false,
            html_url: "https://github.com/owner/repo1",
            clone_url: "https://github.com/owner/repo1.git",
            ssh_url: "git@github.com:owner/repo1.git",
            default_branch: "main",
          },
        ],
        headers: new Headers({}),
      } as Response);

      const repos = await service.listRepos("ghp_token");

      expect(repos).toHaveLength(1);
      expect(repos[0]?.fullName).toBe("owner/repo1");
      expect(repos[0]?.isPrivate).toBe(false);
    });

    it("handles pagination", async () => {
      // First page
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            name: "repo1",
            full_name: "owner/repo1",
            owner: { login: "owner" },
            private: false,
            html_url: "",
            clone_url: "",
            ssh_url: "",
            default_branch: "main",
          },
        ],
        headers: new Headers({
          link: '<https://api.github.com/user/repos?page=2>; rel="next"',
        }),
      } as Response);

      // Second page
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 2,
            name: "repo2",
            full_name: "owner/repo2",
            owner: { login: "owner" },
            private: true,
            html_url: "",
            clone_url: "",
            ssh_url: "",
            default_branch: "main",
          },
        ],
        headers: new Headers({}),
      } as Response);

      const repos = await service.listRepos("ghp_token");

      expect(repos).toHaveLength(2);
      expect(repos[0]?.fullName).toBe("owner/repo1");
      expect(repos[1]?.fullName).toBe("owner/repo2");
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("throws on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Rate limited",
      } as Response);

      await expect(service.listRepos("ghp_token")).rejects.toThrow(
        "GitHub API error: 403",
      );
    });
  });

  describe("getRepo", () => {
    it("returns repo by full name", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123,
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
          private: true,
          description: "A test repo",
          html_url: "https://github.com/owner/repo",
          clone_url: "https://github.com/owner/repo.git",
          ssh_url: "git@github.com:owner/repo.git",
          default_branch: "develop",
        }),
      } as Response);

      const repo = await service.getRepo("ghp_token", "owner/repo");

      expect(repo.id).toBe(123);
      expect(repo.fullName).toBe("owner/repo");
      expect(repo.isPrivate).toBe(true);
      expect(repo.description).toBe("A test repo");
      expect(repo.defaultBranch).toBe("develop");
    });

    it("throws on 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      } as Response);

      await expect(
        service.getRepo("ghp_token", "owner/nonexistent"),
      ).rejects.toThrow("GitHub API error: 404");
    });
  });
});
