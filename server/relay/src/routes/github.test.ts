import { generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { SandboxLogStore } from "../sandbox/log-store";
import { EnvironmentService } from "../services/environment.service";
import { EventJournal } from "./../services/event-journal";
import { ExtensionConfigService } from "../services/extension-config.service";
import { ExtensionManifestService } from "../services/extension-manifest.service";
import { GitHubService } from "../services/github.service";
import { PackageCatalogService } from "./../services/package-catalog.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestGitHubAppService,
  createTestSandboxManager,
  createTestSecretsService,
  createTestSessionHubManager,
} from "../test-helpers";

const TEST_RSA_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({
  type: "pkcs1",
  format: "pem",
}) as string;

describe("GitHub Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;
  let githubService: GitHubService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    const secretsService = createTestSecretsService(db);
    const githubAppService = createTestGitHubAppService(db, secretsService);
    githubService = new GitHubService({
      githubAppService,
      getPat: () => {
        const row = db
          .select()
          .from(settings)
          .where(eq(settings.key, "github_repos_access_token"))
          .get();
        if (!row) return undefined;
        try {
          return JSON.parse(row.value) as string;
        } catch {
          return row.value;
        }
      },
    });
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService,
      githubAppService,
      sandboxManager: createTestSandboxManager(),
      secretsService,
      environmentService: new EnvironmentService(db),
      extensionConfigService: new ExtensionConfigService(db),
      sandboxLogStore: new SandboxLogStore(),
      sessionDataDir: "/tmp/test-session-data",
      sessionHubManager: createTestSessionHubManager(db),
      packageCatalogService: new PackageCatalogService(
        new ExtensionManifestService(),
      ),
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
        .where(eq(settings.key, "github_repos_access_token"))
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
        .where(eq(settings.key, "github_repos_access_token"))
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
      expect(json.error).toContain("GitHub auth not configured");
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
      expect(json.data.mode).toBe("pat");
      expect(json.data.repos).toHaveLength(1);
      expect(json.data.repos[0].fullName).toBe("owner/repo");
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

  describe("GET /api/github/app/status", () => {
    it("returns not configured when no credentials", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/status");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.configured).toBe(false);
      expect(json.data.hasPrivateKey).toBe(false);
      expect(json.data.hasWebhookSecret).toBe(false);
      expect(json.error).toBeNull();
    });
  });

  describe("POST /api/github/app/connect", () => {
    it("stores valid GitHub App credentials", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: 12345,
          privateKey: TEST_RSA_PRIVATE_KEY,
          webhookSecret: "test-webhook-secret",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ok).toBe(true);
      expect(json.data.config.appId).toBe(12345);
      expect(json.error).toBeNull();

      // Verify config stored
      const stored = db
        .select()
        .from(settings)
        .where(eq(settings.key, "github_app_config"))
        .get();
      assert(stored, "app config stored");
      const config = JSON.parse(stored.value) as { appId: number };
      expect(config.appId).toBe(12345);

      // Verify private key stored in secrets
      const secretsService = services.secretsService;
      const privateKey = await secretsService.getValueByEnvVar(
        "GITHUB_APP_PRIVATE_KEY",
      );
      expect(privateKey).toBe(TEST_RSA_PRIVATE_KEY.trim());

      const webhookSecret = await secretsService.getValueByEnvVar(
        "GITHUB_APP_WEBHOOK_SECRET",
      );
      expect(webhookSecret).toBe("test-webhook-secret");
    });

    it("rejects invalid private key", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: 12345,
          privateKey: "not-a-valid-key",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.data).toBeNull();
      expect(json.error).toContain("Invalid private key");
    });

    it("rejects missing appId", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privateKey: TEST_RSA_PRIVATE_KEY,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("appId is required");
    });

    it("rejects missing privateKey", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: 12345,
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("privateKey is required");
    });
  });

  describe("DELETE /api/github/app/connect", () => {
    it("removes GitHub App credentials", async () => {
      // First, connect the app
      const secretsService = services.secretsService;
      await secretsService.setValueByEnvVar(
        "GITHUB_APP_PRIVATE_KEY",
        "test-key",
      );
      await secretsService.setValueByEnvVar(
        "GITHUB_APP_WEBHOOK_SECRET",
        "test-webhook",
      );
      db.insert(settings)
        .values({
          key: "github_app_config",
          value: JSON.stringify({ appId: 12345 }),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const app = createApp({ services });
      const res = await app.request("/api/github/app/connect", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ok).toBe(true);

      // Verify credentials removed
      const privateKey = await secretsService.getValueByEnvVar(
        "GITHUB_APP_PRIVATE_KEY",
      );
      expect(privateKey).toBeNull();

      const webhookSecret = await secretsService.getValueByEnvVar(
        "GITHUB_APP_WEBHOOK_SECRET",
      );
      expect(webhookSecret).toBeNull();

      const stored = db
        .select()
        .from(settings)
        .where(eq(settings.key, "github_app_config"))
        .get();
      expect(stored).toBeUndefined();
    });
  });

  describe("GET /api/github/app/installations", () => {
    it("returns 404 when app not configured", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/github/app/installations");

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain("GitHub App not configured");
    });

    it("returns installations when configured", async () => {
      const secretsService = services.secretsService;
      await secretsService.setValueByEnvVar(
        "GITHUB_APP_PRIVATE_KEY",
        TEST_RSA_PRIVATE_KEY,
      );
      db.insert(settings)
        .values({
          key: "github_app_config",
          value: JSON.stringify({ appId: 12345 }),
          updatedAt: new Date().toISOString(),
        })
        .run();

      // Mock the listInstallations call
      const githubAppService = services.githubAppService;
      vi.spyOn(githubAppService, "listInstallations").mockResolvedValueOnce([
        {
          id: 1,
          account: { login: "testuser", type: "User" },
          repositorySelection: "all",
          accessTokensUrl:
            "https://api.github.com/app/installations/1/access_tokens",
          repositoriesUrl: "https://api.github.com/installation/repositories",
          suspendedAt: null,
        },
      ]);

      const app = createApp({ services });
      const res = await app.request("/api/github/app/installations");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0]?.id).toBe(1);
      expect(json.data[0]?.account.login).toBe("testuser");
    });
  });
});
