import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { secrets } from "../db/schema";
import type { CryptoService, EncryptedData } from "./crypto.service";

/**
 * Grouping kind for secrets.
 * - ai_provider: model provider API keys (used by /api/models)
 * - env_var: arbitrary environment variables for extensions etc.
 * - sandbox_provider: sandbox provider configuration
 */
export type SecretKind = "ai_provider" | "env_var" | "sandbox_provider";

/**
 * Secret metadata (without the decrypted value).
 */
export interface SecretInfo {
  id: string;
  name: string;
  envVar: string;
  kind: SecretKind;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  keyVersion: number;
}

/**
 * Parameters for creating a new secret.
 */
export interface CreateSecretParams {
  name: string;
  envVar: string;
  kind: SecretKind;
  value: string;
  enabled?: boolean;
}

/**
 * Parameters for updating an existing secret.
 * All fields optional; only provided fields are updated.
 */
export interface UpdateSecretParams {
  name?: string;
  envVar?: string;
  kind?: SecretKind;
  enabled?: boolean;
  value?: string;
}

/**
 * Validate envVar: reject NUL bytes, `=`, and empty after trim.
 * Returns trimmed value or throws.
 */
function validateEnvVar(envVar: string): string {
  const trimmed = envVar.trim();
  if (trimmed.length === 0) {
    throw new Error("envVar must not be empty");
  }
  if (trimmed.includes("\0")) {
    throw new Error("envVar must not contain NUL bytes");
  }
  if (trimmed.includes("=")) {
    throw new Error("envVar must not contain '='");
  }
  return trimmed;
}

/**
 * Service for managing encrypted secrets in the database.
 * Secrets are stored with AES-256-GCM encryption at rest.
 */
export class SecretsService {
  constructor(
    private db: AppDatabase,
    private crypto: CryptoService,
  ) {}

  /**
   * Create a new secret. Returns metadata (no decrypted value).
   */
  async create(params: CreateSecretParams): Promise<SecretInfo> {
    const envVar = validateEnvVar(params.envVar);
    const encrypted = this.crypto.encrypt(params.value);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await this.db.insert(secrets).values({
      id,
      name: params.name,
      envVar,
      kind: params.kind,
      enabled: params.enabled ?? true,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag,
      keyVersion: encrypted.keyVersion,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name: params.name,
      envVar,
      kind: params.kind,
      enabled: params.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      keyVersion: encrypted.keyVersion,
    };
  }

  /**
   * Update an existing secret. Returns true if updated, false if not found.
   * If value is provided, re-encrypts.
   */
  async update(id: string, params: UpdateSecretParams): Promise<boolean> {
    const existing = await this.db
      .select()
      .from(secrets)
      .where(eq(secrets.id, id))
      .limit(1);

    if (existing.length === 0) {
      return false;
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (params.name !== undefined) {
      updates.name = params.name;
    }
    if (params.envVar !== undefined) {
      updates.envVar = validateEnvVar(params.envVar);
    }
    if (params.kind !== undefined) {
      updates.kind = params.kind;
    }
    if (params.enabled !== undefined) {
      updates.enabled = params.enabled;
    }
    if (params.value !== undefined) {
      const encrypted = this.crypto.encrypt(params.value);
      updates.iv = encrypted.iv;
      updates.ciphertext = encrypted.ciphertext;
      updates.tag = encrypted.tag;
      updates.keyVersion = encrypted.keyVersion;
    }

    await this.db.update(secrets).set(updates).where(eq(secrets.id, id));
    return true;
  }

  /**
   * Delete a secret by ID.
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(secrets).where(eq(secrets.id, id));
    return result.changes > 0;
  }

  /**
   * List all stored secrets (metadata only, no decrypted values).
   */
  async list(): Promise<SecretInfo[]> {
    const rows = await this.db.select().from(secrets);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      envVar: row.envVar,
      kind: row.kind as SecretKind,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      keyVersion: row.keyVersion,
    }));
  }

  /**
   * Get decrypted value for a single secret by ID.
   * Returns null if not found.
   */
  async getValue(id: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(secrets)
      .where(eq(secrets.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const encrypted: EncryptedData = {
      iv: row.iv,
      ciphertext: row.ciphertext,
      tag: row.tag,
      keyVersion: row.keyVersion,
    };

    return this.crypto.decrypt(encrypted);
  }

  /**
   * Get decrypted value for a secret by its envVar name.
   * Returns null if not found or not enabled.
   */
  async getValueByEnvVar(envVar: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(secrets)
      .where(eq(secrets.envVar, envVar))
      .limit(1);

    const row = rows[0];
    if (!row || !row.enabled) return null;

    const encrypted: EncryptedData = {
      iv: row.iv,
      ciphertext: row.ciphertext,
      tag: row.tag,
      keyVersion: row.keyVersion,
    };

    return this.crypto.decrypt(encrypted);
  }

  /**
   * Get all enabled secrets as { envVar: decryptedValue } map.
   * Used for sandbox injection. Only returns secrets where enabled = true.
   */
  async getAllAsEnv(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    const rows = await this.db
      .select()
      .from(secrets)
      .where(eq(secrets.enabled, true));

    for (const row of rows) {
      const encrypted: EncryptedData = {
        iv: row.iv,
        ciphertext: row.ciphertext,
        tag: row.tag,
        keyVersion: row.keyVersion,
      };
      result[row.envVar] = this.crypto.decrypt(encrypted);
    }

    return result;
  }

  /**
   * Get env var names for enabled secrets of a specific kind.
   * Used by /api/models to set dummy env vars for pi-ai provider detection.
   */
  async getEnabledEnvVarsByKind(kind: SecretKind): Promise<string[]> {
    const rows = await this.db.select().from(secrets);
    return rows
      .filter((r) => r.kind === kind && r.enabled)
      .map((r) => r.envVar);
  }

  /**
   * Re-encrypt all secrets with the current key.
   * Use after key rotation.
   */
  async reencryptAll(): Promise<number> {
    const rows = await this.db.select().from(secrets);
    let count = 0;

    for (const row of rows) {
      if (row.keyVersion === this.crypto.getKeyVersion()) {
        continue;
      }

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
