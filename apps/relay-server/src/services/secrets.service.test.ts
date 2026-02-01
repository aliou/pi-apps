import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "../db/connection";
import { createTestDatabase } from "../test-helpers";
import { CryptoService } from "./crypto.service";
import { SECRET_ENV_MAP, SecretsService } from "./secrets.service";

describe("SecretsService", () => {
  let db: AppDatabase;
  let sqlite: ReturnType<typeof createTestDatabase>["sqlite"];
  let crypto: CryptoService;
  let service: SecretsService;

  beforeEach(() => {
    const result = createTestDatabase();
    db = result.db;
    sqlite = result.sqlite;

    // Create crypto service with test key
    const testKey = CryptoService.generateKey();
    crypto = new CryptoService(testKey);

    // Create service
    service = new SecretsService(db, crypto);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("set", () => {
    it("stores an encrypted secret", async () => {
      await service.set("anthropic_api_key", "sk-ant-test-key");

      const value = await service.get("anthropic_api_key");
      expect(value).toBe("sk-ant-test-key");
    });

    it("updates existing secret", async () => {
      await service.set("anthropic_api_key", "old-key");
      await service.set("anthropic_api_key", "new-key");

      const value = await service.get("anthropic_api_key");
      expect(value).toBe("new-key");
    });
  });

  describe("get", () => {
    it("returns null for non-existent secret", async () => {
      const value = await service.get("anthropic_api_key");
      expect(value).toBeNull();
    });

    it("decrypts stored secret", async () => {
      const apiKey = "sk-ant-api03-very-long-key-here";
      await service.set("anthropic_api_key", apiKey);

      const value = await service.get("anthropic_api_key");
      expect(value).toBe(apiKey);
    });
  });

  describe("delete", () => {
    it("removes a secret", async () => {
      await service.set("openai_api_key", "sk-test");
      const deleted = await service.delete("openai_api_key");

      expect(deleted).toBe(true);
      expect(await service.get("openai_api_key")).toBeNull();
    });

    it("returns false for non-existent secret", async () => {
      const deleted = await service.delete("openai_api_key");
      expect(deleted).toBe(false);
    });
  });

  describe("has", () => {
    it("returns true for existing secret", async () => {
      await service.set("gemini_api_key", "test");
      expect(await service.has("gemini_api_key")).toBe(true);
    });

    it("returns false for non-existent secret", async () => {
      expect(await service.has("gemini_api_key")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array when no secrets", async () => {
      const list = await service.list();
      expect(list).toEqual([]);
    });

    it("returns metadata for all secrets", async () => {
      await service.set("anthropic_api_key", "key1");
      await service.set("openai_api_key", "key2");

      const list = await service.list();

      expect(list).toHaveLength(2);
      expect(list.map((s) => s.id).sort()).toEqual([
        "anthropic_api_key",
        "openai_api_key",
      ]);

      // Should not include decrypted values
      for (const secret of list) {
        expect(secret).not.toHaveProperty("value");
        expect(secret).toHaveProperty("name");
        expect(secret).toHaveProperty("createdAt");
        expect(secret).toHaveProperty("updatedAt");
      }
    });
  });

  describe("getAllAsEnv", () => {
    it("returns empty object when no secrets", async () => {
      const env = await service.getAllAsEnv();
      expect(env).toEqual({});
    });

    it("returns secrets as environment variable map", async () => {
      await service.set("anthropic_api_key", "sk-ant-123");
      await service.set("openai_api_key", "sk-openai-456");

      const env = await service.getAllAsEnv();

      expect(env).toEqual({
        ANTHROPIC_API_KEY: "sk-ant-123",
        OPENAI_API_KEY: "sk-openai-456",
      });
    });

    it("uses correct env var names from SECRET_ENV_MAP", async () => {
      // Set all known secrets
      await service.set("anthropic_api_key", "a");
      await service.set("openai_api_key", "b");
      await service.set("gemini_api_key", "c");
      await service.set("groq_api_key", "d");
      await service.set("deepseek_api_key", "e");
      await service.set("openrouter_api_key", "f");

      const env = await service.getAllAsEnv();

      expect(env).toEqual({
        ANTHROPIC_API_KEY: "a",
        OPENAI_API_KEY: "b",
        GEMINI_API_KEY: "c",
        GROQ_API_KEY: "d",
        DEEPSEEK_API_KEY: "e",
        OPENROUTER_API_KEY: "f",
      });
    });
  });

  describe("SECRET_ENV_MAP", () => {
    it("has mappings for all secret IDs", () => {
      const expectedIds = [
        "anthropic_api_key",
        "openai_api_key",
        "gemini_api_key",
        "groq_api_key",
        "deepseek_api_key",
        "openrouter_api_key",
      ];

      for (const id of expectedIds) {
        expect(SECRET_ENV_MAP).toHaveProperty(id);
        expect(typeof SECRET_ENV_MAP[id as keyof typeof SECRET_ENV_MAP]).toBe(
          "string",
        );
      }
    });
  });
});
