import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { settings } from "../db/schema";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "../services/event-journal";
import { GitHubService } from "../services/github.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
} from "../test-helpers";

describe("GitHub Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;
  let githubService: GitHubService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    githubService = new GitHubService();
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService,
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
      environmentService: new EnvironmentService(db),
      sessionDataDir: "/tmp/test-session-data",
    };
  });

  afterEach(() => {
    sqlite.close();
    vi.restoreAllMocks();
  });

  describe("GET /api/github/token", () => {
    it("returns configured: false when no token", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/token");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.configured).toBe(false);
      expect(json.error).toBeNull();
    });

    it("returns token info when configured", async () => {
      // Store a token
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_test"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // Mock validation
      vi.spyOn(githubService, "validateToken").mockResolvedValueOnce({
        valid: true,
        user: "testuser",
        scopes: ["repo"],
        rateLimitRemaining: 5000,
      });

      const app = createApp({ services });
      const res = await app.request("/api/github/token");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.configured).toBe(true);
      expect(json.data.valid).toBe(true);
      expect(json.data.user).toBe("testuser");
      expect(json.data.scopes).toContain("repo");
    });

    it("returns invalid when token validation fails", async () => {
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_invalid"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      vi.spyOn(githubService, "validateToken").mockResolvedValueOnce({
        valid: false,
        error: "Bad credentials",
      });

      const app = createApp({ services });
      const res = await app.request("/api/github/token");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.configured).toBe(true);
      expect(json.data.valid).toBe(false);
      expect(json.data.error).toBe("Bad credentials");
    });
  });

  describe("POST /api/github/token", () => {
    it("stores valid token", async () => {
      vi.spyOn(githubService, "validateToken").mockResolvedValueOnce({
        valid: true,
        user: "testuser",
        scopes: ["repo", "user"],
      });

      const app = createApp({ services });
      const res = await app.request("/api/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ghp_valid" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.user).toBe("testuser");
      expect(json.data.scopes).toContain("repo");
      expect(json.error).toBeNull();

      // Verify stored
      const stored = db
        .select()
        .from(settings)
        .where(
          require("drizzle-orm").eq(settings.key, "github_repos_access_token"),
        )
        .get();
      assert(stored, "token stored");
      expect(JSON.parse(stored.value)).toBe("ghp_valid");
    });

    it("rejects invalid token", async () => {
      vi.spyOn(githubService, "validateToken").mockResolvedValueOnce({
        valid: false,
        error: "Bad credentials",
      });

      const app = createApp({ services });
      const res = await app.request("/api/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "ghp_invalid" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.data).toBeNull();
      expect(json.error).toBe("Bad credentials");
    });

    it("rejects empty token", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Token is required");
    });

    it("rejects missing token", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Token is required");
    });
  });

  describe("DELETE /api/github/token", () => {
    it("removes token", async () => {
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_test"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const app = createApp({ services });
      const res = await app.request("/api/github/token", { method: "DELETE" });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ok).toBe(true);

      // Verify removed
      const stored = db
        .select()
        .from(settings)
        .where(
          require("drizzle-orm").eq(settings.key, "github_repos_access_token"),
        )
        .get();
      expect(stored).toBeUndefined();
    });
  });

  describe("GET /api/github/repos", () => {
    it("returns 401 when no token configured", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/repos");

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("GitHub token not configured");
    });

    it("returns repos when token configured", async () => {
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_test"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      vi.spyOn(githubService, "listRepos").mockResolvedValueOnce([
        {
          id: 1,
          name: "repo",
          fullName: "owner/repo",
          owner: "owner",
          isPrivate: false,
          htmlUrl: "https://github.com/owner/repo",
          cloneUrl: "https://github.com/owner/repo.git",
          sshUrl: "git@github.com:owner/repo.git",
          defaultBranch: "main",
        },
      ]);

      const app = createApp({ services });
      const res = await app.request("/api/github/repos");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].fullName).toBe("owner/repo");
    });

    it("returns error on API failure", async () => {
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_test"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      vi.spyOn(githubService, "listRepos").mockRejectedValueOnce(
        new Error("Rate limited"),
      );

      const app = createApp({ services });
      const res = await app.request("/api/github/repos");

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Rate limited");
    });
  });
});
