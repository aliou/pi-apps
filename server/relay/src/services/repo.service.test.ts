import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { RepoService } from "./repo.service";

describe("RepoService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let service: RepoService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    service = new RepoService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("upsert", () => {
    it("inserts new repo", () => {
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
        isPrivate: false,
        description: "Test repo",
        htmlUrl: "https://github.com/owner/repo",
        cloneUrl: "https://github.com/owner/repo.git",
        sshUrl: "git@github.com:owner/repo.git",
        defaultBranch: "main",
      });

      const repo = service.get("owner/repo");
      expect(repo).toBeDefined();
      expect(repo?.name).toBe("repo");
      expect(repo?.owner).toBe("owner");
      expect(repo?.description).toBe("Test repo");
      expect(repo?.defaultBranch).toBe("main");
      expect(repo?.isPrivate).toBe(false);
    });

    it("updates existing repo", async () => {
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
        description: "Original",
      });

      const original = service.get("owner/repo");
      assert(original, "original exists");
      const originalUpdatedAt = original.updatedAt;

      await new Promise((r) => setTimeout(r, 10));

      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
        description: "Updated",
      });

      const updated = service.get("owner/repo");
      assert(updated, "updated exists");
      expect(updated.description).toBe("Updated");
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      );
    });

    it("preserves fields not in update", () => {
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
        isPrivate: true,
        description: "Original desc",
        defaultBranch: "main",
      });

      // Update without isPrivate, description, defaultBranch
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
      });

      const repo = service.get("owner/repo");
      expect(repo?.isPrivate).toBe(true);
      expect(repo?.description).toBe("Original desc");
      expect(repo?.defaultBranch).toBe("main");
    });
  });

  describe("get", () => {
    it("returns repo by ID", () => {
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
      });

      const repo = service.get("owner/repo");
      expect(repo).toBeDefined();
      expect(repo?.id).toBe("owner/repo");
    });

    it("returns undefined for nonexistent ID", () => {
      const repo = service.get("nonexistent/repo");
      expect(repo).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns repos ordered by full name", () => {
      service.upsert({
        id: "zeta/repo",
        name: "repo",
        fullName: "zeta/repo",
        owner: "zeta",
      });
      service.upsert({
        id: "alpha/repo",
        name: "repo",
        fullName: "alpha/repo",
        owner: "alpha",
      });
      service.upsert({
        id: "beta/repo",
        name: "repo",
        fullName: "beta/repo",
        owner: "beta",
      });

      const repos = service.list();
      expect(repos).toHaveLength(3);
      expect(repos[0]?.fullName).toBe("alpha/repo");
      expect(repos[1]?.fullName).toBe("beta/repo");
      expect(repos[2]?.fullName).toBe("zeta/repo");
    });

    it("returns empty array when no repos", () => {
      const repos = service.list();
      expect(repos).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("removes repo", () => {
      service.upsert({
        id: "owner/repo",
        name: "repo",
        fullName: "owner/repo",
        owner: "owner",
      });

      expect(service.get("owner/repo")).toBeDefined();

      service.delete("owner/repo");

      expect(service.get("owner/repo")).toBeUndefined();
    });

    it("does nothing for nonexistent repo", () => {
      // Should not throw
      expect(() => service.delete("nonexistent/repo")).not.toThrow();
    });
  });
});
