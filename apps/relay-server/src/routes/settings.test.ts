import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import { type AppServices, createApp } from "../app";
import type { AppDatabase } from "../db/connection";
import { settings } from "../db/schema";
import { EventJournal } from "../services/event-journal";
import { GitHubService } from "../services/github.service";
import { RepoService } from "../services/repo.service";
import { SessionService } from "../services/session.service";
import {
  createTestDatabase,
  createTestSandboxManager,
  createTestSecretsService,
} from "../test-helpers";

describe("Settings Routes", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let services: AppServices;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    services = {
      db,
      sessionService: new SessionService(db),
      eventJournal: new EventJournal(db),
      repoService: new RepoService(db),
      githubService: new GitHubService(),
      sandboxManager: createTestSandboxManager(),
      secretsService: createTestSecretsService(db),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("GET /api/settings", () => {
    it("returns empty object when no settings", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({});
      expect(json.error).toBeNull();
    });

    it("returns settings as object", async () => {
      db.insert(settings)
        .values({
          key: "default_model",
          value: JSON.stringify({
            provider: "anthropic",
            modelId: "claude-3-opus",
          }),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const app = createApp({ services });
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.default_model).toEqual({
        provider: "anthropic",
        modelId: "claude-3-opus",
      });
    });

    it("excludes protected keys", async () => {
      db.insert(settings)
        .values({
          key: "github_repos_access_token",
          value: JSON.stringify("ghp_secret"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      db.insert(settings)
        .values({
          key: "public_setting",
          value: JSON.stringify("visible"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const app = createApp({ services });
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.github_repos_access_token).toBeUndefined();
      expect(json.data.public_setting).toBe("visible");
    });
  });

  describe("PUT /api/settings", () => {
    it("creates new setting", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "theme", value: "dark" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.ok).toBe(true);

      // Verify stored
      const stored = db
        .select()
        .from(settings)
        .where(require("drizzle-orm").eq(settings.key, "theme"))
        .get();
      assert(stored, "setting stored");
      expect(JSON.parse(stored.value)).toBe("dark");
    });

    it("updates existing setting", async () => {
      db.insert(settings)
        .values({
          key: "theme",
          value: JSON.stringify("light"),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const app = createApp({ services });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "theme", value: "dark" }),
      });

      expect(res.status).toBe(200);

      const stored = db
        .select()
        .from(settings)
        .where(require("drizzle-orm").eq(settings.key, "theme"))
        .get();
      assert(stored, "setting stored");
      expect(JSON.parse(stored.value)).toBe("dark");
    });

    it("stores complex values", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "preferences",
          value: { nested: { array: [1, 2, 3] } },
        }),
      });

      expect(res.status).toBe(200);

      const stored = db
        .select()
        .from(settings)
        .where(require("drizzle-orm").eq(settings.key, "preferences"))
        .get();
      assert(stored, "setting stored");
      expect(JSON.parse(stored.value)).toEqual({
        nested: { array: [1, 2, 3] },
      });
    });

    it("rejects empty key", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "", value: "test" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Key is required");
    });

    it("rejects protected keys", async () => {
      const app = createApp({ services });
      const res = await app.request("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "github_repos_access_token",
          value: "ghp_hack",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Cannot modify protected setting");
    });
  });
});
