import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { EnvironmentService } from "./environment.service";

describe("EnvironmentService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let service: EnvironmentService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;
    service = new EnvironmentService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("creates environment with valid config", () => {
      const env = service.create({
        name: "Test Env",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      expect(env.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(env.name).toBe("Test Env");
      expect(env.sandboxType).toBe("docker");
      expect(JSON.parse(env.config)).toEqual({
        image: "ghcr.io/aliou/pi-sandbox-codex-universal",
      });
      expect(env.isDefault).toBe(true);
      expect(env.createdAt).toBeDefined();
      expect(env.updatedAt).toBeDefined();
    });

    it("creates environment with resource tier in config", () => {
      const env = service.create({
        name: "Heavy Env",
        sandboxType: "docker",
        config: {
          image: "ghcr.io/aliou/pi-sandbox-codex-universal",
          resourceTier: "large",
        },
      });

      const config = JSON.parse(env.config);
      expect(config.resourceTier).toBe("large");
    });
  });

  describe("isDefault", () => {
    it("sets first environment as default when isDefault is omitted", () => {
      const first = service.create({
        name: "First",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      expect(first.isDefault).toBe(true);
      expect(service.getDefault()?.id).toBe(first.id);
    });

    it("does not steal default when creating a second environment without isDefault", () => {
      const first = service.create({
        name: "First",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      const second = service.create({
        name: "Second",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      expect(service.get(first.id)?.isDefault).toBe(true);
      expect(service.get(second.id)?.isDefault).toBe(false);
      expect(service.getDefault()?.id).toBe(first.id);
    });

    it("sets isDefault and clears others", () => {
      const env1 = service.create({
        name: "Env 1",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: true,
      });

      expect(service.get(env1.id)?.isDefault).toBe(true);

      // Create second as default - first should lose default
      const env2 = service.create({
        name: "Env 2",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: true,
      });

      expect(service.get(env1.id)?.isDefault).toBe(false);
      expect(service.get(env2.id)?.isDefault).toBe(true);
    });

    it("returns default environment", () => {
      service.create({
        name: "Non-default",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      const defaultEnv = service.create({
        name: "Default",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: true,
      });

      const result = service.getDefault();
      expect(result).toBeDefined();
      expect(result?.id).toBe(defaultEnv.id);
    });

    it("returns undefined when no default set", () => {
      service.create({
        name: "Not Default",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: false,
      });

      expect(service.getDefault()).toBeUndefined();
    });
  });

  describe("get", () => {
    it("returns environment by ID", () => {
      const created = service.create({
        name: "Test",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      const fetched = service.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe("Test");
    });

    it("returns undefined for nonexistent ID", () => {
      expect(service.get("nonexistent")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("lists all environments", () => {
      service.create({
        name: "Env 1",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });
      service.create({
        name: "Env 2",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      const list = service.list();
      expect(list).toHaveLength(2);
    });

    it("returns empty array when no environments exist", () => {
      expect(service.list()).toEqual([]);
    });
  });

  describe("update", () => {
    it("updates environment name", () => {
      const env = service.create({
        name: "Original",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      service.update(env.id, { name: "Updated" });
      expect(service.get(env.id)?.name).toBe("Updated");
    });

    it("updates config", () => {
      const env = service.create({
        name: "Test",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      service.update(env.id, {
        config: {
          image: "ghcr.io/aliou/pi-sandbox-codex-universal",
          resourceTier: "large",
        },
      });

      const updated = service.get(env.id);
      const config = JSON.parse(updated?.config ?? "{}");
      expect(config.resourceTier).toBe("large");
    });

    it("updates isDefault and clears others", () => {
      const env1 = service.create({
        name: "Env 1",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
        isDefault: true,
      });

      const env2 = service.create({
        name: "Env 2",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      service.update(env2.id, { isDefault: true });

      expect(service.get(env1.id)?.isDefault).toBe(false);
      expect(service.get(env2.id)?.isDefault).toBe(true);
    });

    it("bumps updatedAt", async () => {
      const env = service.create({
        name: "Test",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });
      const originalUpdated = env.updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      service.update(env.id, { name: "Changed" });

      const updated = service.get(env.id);
      expect(updated?.updatedAt).not.toBe(originalUpdated);
    });

    it("throws for nonexistent environment", () => {
      expect(() => {
        service.update("nonexistent", { name: "Fail" });
      }).toThrow("Environment not found");
    });
  });

  describe("delete", () => {
    it("deletes environment", () => {
      const env = service.create({
        name: "To Delete",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      service.delete(env.id);
      expect(service.get(env.id)).toBeUndefined();
    });

    it("removes from list after deletion", () => {
      const env = service.create({
        name: "Delete Me",
        sandboxType: "docker",
        config: { image: "ghcr.io/aliou/pi-sandbox-codex-universal" },
      });

      expect(service.list()).toHaveLength(1);
      service.delete(env.id);
      expect(service.list()).toHaveLength(0);
    });
  });
});
