import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { secrets } from "../db/schema";
import type { CryptoService, EncryptedData } from "./crypto.service";

/**
 * Known secret identifiers for type safety.
 * These are provider API keys only - GitHub token for repo access
 * is stored separately in settings.
 */
export type SecretId =
  | "anthropic_api_key"
  | "openai_api_key"
  | "gemini_api_key"
  | "groq_api_key"
  | "deepseek_api_key"
  | "openrouter_api_key";

/**
 * Secret metadata (without the decrypted value).
 */
export interface SecretInfo {
  id: SecretId;
  name: string;
  createdAt: string;
  updatedAt: string;
  keyVersion: number;
}

/**
 * Environment variable mapping for secrets.
 */
export const SECRET_ENV_MAP: Record<SecretId, string> = {
  anthropic_api_key: "ANTHROPIC_API_KEY",
  openai_api_key: "OPENAI_API_KEY",
  gemini_api_key: "GEMINI_API_KEY",
  groq_api_key: "GROQ_API_KEY",
  deepseek_api_key: "DEEPSEEK_API_KEY",
  openrouter_api_key: "OPENROUTER_API_KEY",
};

/**
 * Human-readable names for secrets.
 */
const SECRET_NAMES: Record<SecretId, string> = {
  anthropic_api_key: "Anthropic API Key",
  openai_api_key: "OpenAI API Key",
  gemini_api_key: "Google Gemini API Key",
  groq_api_key: "Groq API Key",
  deepseek_api_key: "DeepSeek API Key",
  openrouter_api_key: "OpenRouter API Key",
};

/**
 * Service for managing encrypted secrets in the database.
 */
export class SecretsService {
  constructor(
    private db: AppDatabase,
    private crypto: CryptoService,
  ) {}

  /**
   * Store a secret (encrypts and saves to database).
   */
  async set(id: SecretId, value: string): Promise<void> {
    const encrypted = this.crypto.encrypt(value);
    const now = new Date().toISOString();

    await this.db
      .insert(secrets)
      .values({
        id,
        name: SECRET_NAMES[id] ?? id,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        tag: encrypted.tag,
        keyVersion: encrypted.keyVersion,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: secrets.id,
        set: {
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          tag: encrypted.tag,
          keyVersion: encrypted.keyVersion,
          updatedAt: now,
        },
      });
  }

  /**
   * Retrieve and decrypt a secret.
   * Returns null if not found.
   */
  async get(id: SecretId): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(secrets)
      .where(eq(secrets.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    const encrypted: EncryptedData = {
      iv: row.iv,
      ciphertext: row.ciphertext,
      tag: row.tag,
      keyVersion: row.keyVersion,
    };

    return this.crypto.decrypt(encrypted);
  }

  /**
   * Delete a secret.
   */
  async delete(id: SecretId): Promise<boolean> {
    const result = await this.db.delete(secrets).where(eq(secrets.id, id));
    return result.changes > 0;
  }

  /**
   * Check if a secret exists.
   */
  async has(id: SecretId): Promise<boolean> {
    const rows = await this.db
      .select({ id: secrets.id })
      .from(secrets)
      .where(eq(secrets.id, id))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * List all stored secrets (metadata only, not values).
   */
  async list(): Promise<SecretInfo[]> {
    const rows = await this.db.select().from(secrets);
    return rows.map((row) => ({
      id: row.id as SecretId,
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      keyVersion: row.keyVersion,
    }));
  }

  /**
   * Get all secrets as environment variable key-value pairs.
   * Used for injecting into sandbox containers.
   */
  async getAllAsEnv(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const rows = await this.db.select().from(secrets);

    for (const row of rows) {
      const id = row.id as SecretId;
      const envKey = SECRET_ENV_MAP[id];
      if (envKey) {
        const encrypted: EncryptedData = {
          iv: row.iv,
          ciphertext: row.ciphertext,
          tag: row.tag,
          keyVersion: row.keyVersion,
        };
        result[envKey] = this.crypto.decrypt(encrypted);
      }
    }

    return result;
  }

  /**
   * Re-encrypt all secrets with the current key.
   * Use after key rotation.
   */
  async reencryptAll(): Promise<number> {
    const rows = await this.db.select().from(secrets);
    let count = 0;

    for (const row of rows) {
      // Skip if already using current key version
      if (row.keyVersion === this.crypto.getKeyVersion()) {
        continue;
      }

      // Decrypt with old key would require multi-key support
      // For now, this just re-encrypts with current key
      const encrypted: EncryptedData = {
        iv: row.iv,
        ciphertext: row.ciphertext,
        tag: row.tag,
        keyVersion: row.keyVersion,
      };

      const value = this.crypto.decrypt(encrypted);
      const reencrypted = this.crypto.encrypt(value);
      const now = new Date().toISOString();

      await this.db
        .update(secrets)
        .set({
          iv: reencrypted.iv,
          ciphertext: reencrypted.ciphertext,
          tag: reencrypted.tag,
          keyVersion: reencrypted.keyVersion,
          updatedAt: now,
        })
        .where(eq(secrets.id, row.id));

      count++;
    }

    return count;
  }
}
