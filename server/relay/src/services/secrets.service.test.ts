import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { CryptoService } from "./crypto.service";
import { SecretsService } from "./secrets.service";

describe("SecretsService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let crypto: CryptoService;
  let service: SecretsService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;

    const testKey = CryptoService.generateKey();
    crypto = new CryptoService(testKey);
    service = new SecretsService(db, crypto);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("creates a secret and returns metadata", async () => {
      const secret = await service.create({
        name: "Anthropic",
        envVar: "ANTHROPIC_API_KEY",
        kind: "ai_provider",
        value: "sk-ant-test-key",
      });

      expect(secret.id).toBeDefined();
      expect(secret.name).toBe("Anthropic");
      expect(secret.envVar).toBe("ANTHROPIC_API_KEY");
      expect(secret.kind).toBe("ai_provider");
      expect(secret.enabled).toBe(true);
      expect(secret.createdAt).toBeDefined();
      expect(secret.updatedAt).toBeDefined();
      // No decrypted value in metadata
      expect(secret).not.toHaveProperty("value");
    });

    it("creates a disabled secret", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "TEST_KEY",
        kind: "env_var",
        value: "val",
        enabled: false,
      });

      expect(secret.enabled).toBe(false);
    });

    it("trims envVar whitespace", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "  MY_KEY  ",
        kind: "env_var",
        value: "val",
      });

      expect(secret.envVar).toBe("MY_KEY");
    });

    it("rejects empty envVar", async () => {
      await expect(
        service.create({
          name: "Test",
          envVar: "  ",
          kind: "env_var",
          value: "val",
        }),
      ).rejects.toThrow("envVar must not be empty");
    });

    it("rejects envVar with NUL byte", async () => {
      await expect(
        service.create({
          name: "Test",
          envVar: "MY\0KEY",
          kind: "env_var",
          value: "val",
        }),
      ).rejects.toThrow("envVar must not contain NUL bytes");
    });

    it("rejects envVar with = sign", async () => {
      await expect(
        service.create({
          name: "Test",
          envVar: "MY=KEY",
          kind: "env_var",
          value: "val",
        }),
      ).rejects.toThrow("envVar must not contain '='");
    });

    it("rejects duplicate envVar", async () => {
      await service.create({
        name: "First",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "val1",
      });

      await expect(
        service.create({
          name: "Second",
          envVar: "MY_KEY",
          kind: "env_var",
          value: "val2",
        }),
      ).rejects.toThrow(/UNIQUE constraint/);
    });
  });

  describe("update", () => {
    it("updates name", async () => {
      const secret = await service.create({
        name: "Old Name",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "val",
      });

      const updated = await service.update(secret.id, { name: "New Name" });
      expect(updated).toBe(true);

      const list = await service.list();
      expect(list[0]?.name).toBe("New Name");
    });

    it("updates enabled flag", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "val",
      });

      await service.update(secret.id, { enabled: false });
      const list = await service.list();
      expect(list[0]?.enabled).toBe(false);
    });

    it("updates value (re-encrypts)", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "old-value",
      });

      await service.update(secret.id, { value: "new-value" });
      const decrypted = await service.getValue(secret.id);
      expect(decrypted).toBe("new-value");
    });

    it("returns false for non-existent id", async () => {
      const result = await service.update("nonexistent", { name: "x" });
      expect(result).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes a secret", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "val",
      });

      const deleted = await service.delete(secret.id);
      expect(deleted).toBe(true);

      const list = await service.list();
      expect(list).toHaveLength(0);
    });

    it("returns false for non-existent id", async () => {
      const deleted = await service.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array when no secrets", async () => {
      const list = await service.list();
      expect(list).toEqual([]);
    });

    it("returns metadata for all secrets", async () => {
      await service.create({
        name: "Key A",
        envVar: "KEY_A",
        kind: "ai_provider",
        value: "val-a",
      });
      await service.create({
        name: "Key B",
        envVar: "KEY_B",
        kind: "env_var",
        value: "val-b",
      });

      const list = await service.list();
      expect(list).toHaveLength(2);

      for (const secret of list) {
        expect(secret).not.toHaveProperty("value");
        expect(secret).toHaveProperty("id");
        expect(secret).toHaveProperty("name");
        expect(secret).toHaveProperty("envVar");
        expect(secret).toHaveProperty("kind");
        expect(secret).toHaveProperty("enabled");
        expect(secret).toHaveProperty("createdAt");
        expect(secret).toHaveProperty("updatedAt");
      }
    });
  });

  describe("getValue", () => {
    it("returns null for non-existent id", async () => {
      const value = await service.getValue("nonexistent");
      expect(value).toBeNull();
    });

    it("decrypts stored secret", async () => {
      const secret = await service.create({
        name: "Test",
        envVar: "MY_KEY",
        kind: "env_var",
        value: "sk-secret-value-123",
      });

      const value = await service.getValue(secret.id);
      expect(value).toBe("sk-secret-value-123");
    });
  });

  describe("getAllAsEnv", () => {
    it("returns empty object when no secrets", async () => {
      const env = await service.getAllAsEnv();
      expect(env).toEqual({});
    });

    it("returns only enabled secrets as env map", async () => {
      await service.create({
        name: "Active",
        envVar: "ACTIVE_KEY",
        kind: "ai_provider",
        value: "active-value",
      });
      await service.create({
        name: "Disabled",
        envVar: "DISABLED_KEY",
        kind: "ai_provider",
        value: "disabled-value",
        enabled: false,
      });

      const env = await service.getAllAsEnv();
      expect(env).toEqual({ ACTIVE_KEY: "active-value" });
      expect(env).not.toHaveProperty("DISABLED_KEY");
    });

    it("uses envVar as the key (not id)", async () => {
      await service.create({
        name: "OpenAI",
        envVar: "OPENAI_API_KEY",
        kind: "ai_provider",
        value: "sk-123",
      });

      const env = await service.getAllAsEnv();
      expect(env).toEqual({ OPENAI_API_KEY: "sk-123" });
    });
  });

  describe("getEnabledEnvVarsByKind", () => {
    it("returns only ai_provider env vars when filtered", async () => {
      await service.create({
        name: "OpenAI",
        envVar: "OPENAI_API_KEY",
        kind: "ai_provider",
        value: "sk-123",
      });
      await service.create({
        name: "Custom",
        envVar: "MY_CUSTOM_VAR",
        kind: "env_var",
        value: "custom-val",
      });

      const envVars = await service.getEnabledEnvVarsByKind("ai_provider");
      expect(envVars).toEqual(["OPENAI_API_KEY"]);
    });

    it("excludes disabled secrets", async () => {
      await service.create({
        name: "OpenAI",
        envVar: "OPENAI_API_KEY",
        kind: "ai_provider",
        value: "sk-123",
        enabled: false,
      });

      const envVars = await service.getEnabledEnvVarsByKind("ai_provider");
      expect(envVars).toEqual([]);
    });
  });
});
