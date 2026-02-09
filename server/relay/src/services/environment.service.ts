import { eq, ne } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type Environment, environments } from "../db/schema";
import type { SandboxResourceTier } from "../sandbox/provider-types";

/**
 * Per-environment config stored as JSON in the environments table.
 * Fields are provider-specific:
 * - Docker: image (required), resourceTier (optional)
 * - Cloudflare: workerUrl (required), resourceTier (optional)
 */
/**
 * Per-environment config stored as JSON in the environments table.
 * Fields are provider-specific:
 * - Docker: image (required), resourceTier (optional)
 * - Cloudflare: workerUrl (required), secretId (required, references secrets table), resourceTier (optional)
 */
export interface EnvironmentConfig {
  /** Docker image name (required for docker type) */
  image?: string;
  /** Cloudflare Worker URL (required for cloudflare type) */
  workerUrl?: string;
  /** Secret ID referencing the shared secret in the secrets table (required for cloudflare type) */
  secretId?: string;
  resourceTier?: SandboxResourceTier;
}

export type SandboxType = "docker" | "cloudflare";

export interface CreateEnvironmentParams {
  name: string;
  sandboxType: SandboxType;
  config: EnvironmentConfig;
  isDefault?: boolean;
}

export interface UpdateEnvironmentParams {
  name?: string;
  config?: EnvironmentConfig;
  isDefault?: boolean;
}

export type EnvironmentRecord = Environment;

/**
 * Hardcoded list of available Docker images.
 * In the future, this could be fetched from a container registry.
 */
export const AVAILABLE_DOCKER_IMAGES = [
  {
    id: "codex-universal",
    name: "Codex Universal",
    image: "ghcr.io/aliou/pi-sandbox-codex-universal:latest",
    description: "Multi-language environment (Node, Python, Go, Rust, etc.)",
  },
  {
    id: "alpine-arm64",
    name: "Alpine ARM64",
    image: "ghcr.io/aliou/pi-sandbox-alpine-arm64:latest",
    description: "Lightweight Alpine-based image for ARM64 hosts.",
  },
] as const;

export type AvailableImage = (typeof AVAILABLE_DOCKER_IMAGES)[number];

export class EnvironmentService {
  constructor(private db: AppDatabase) {}

  /**
   * Create a new environment.
   */
  create(params: CreateEnvironmentParams): EnvironmentRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // If setting as default, clear other defaults first
    if (params.isDefault) {
      this.clearOtherDefaults();
    }

    const newEnv = {
      id,
      name: params.name,
      sandboxType: params.sandboxType,
      config: JSON.stringify(params.config),
      isDefault: params.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(environments).values(newEnv).run();

    // biome-ignore lint/style/noNonNullAssertion: just inserted
    return this.get(id)!;
  }

  /**
   * Get an environment by ID.
   */
  get(id: string): EnvironmentRecord | undefined {
    return this.db
      .select()
      .from(environments)
      .where(eq(environments.id, id))
      .get();
  }

  /**
   * List all environments.
   */
  list(): EnvironmentRecord[] {
    return this.db.select().from(environments).all();
  }

  /**
   * Get the default environment, if one is set.
   */
  getDefault(): EnvironmentRecord | undefined {
    return this.db
      .select()
      .from(environments)
      .where(eq(environments.isDefault, true))
      .get();
  }

  /**
   * Update an environment.
   */
  update(id: string, params: UpdateEnvironmentParams): void {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Environment not found: ${id}`);
    }

    // If setting as default, clear other defaults first
    if (params.isDefault) {
      this.clearOtherDefaults(id);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (params.name !== undefined) {
      updates.name = params.name;
    }
    if (params.config !== undefined) {
      updates.config = JSON.stringify(params.config);
    }
    if (params.isDefault !== undefined) {
      updates.isDefault = params.isDefault;
    }

    this.db
      .update(environments)
      .set(updates)
      .where(eq(environments.id, id))
      .run();
  }

  /**
   * Delete an environment.
   */
  delete(id: string): void {
    this.db.delete(environments).where(eq(environments.id, id)).run();
  }

  /**
   * Clear isDefault on all environments except the specified one.
   */
  private clearOtherDefaults(exceptId?: string): void {
    if (exceptId) {
      this.db
        .update(environments)
        .set({ isDefault: false, updatedAt: new Date().toISOString() })
        .where(ne(environments.id, exceptId))
        .run();
    } else {
      this.db
        .update(environments)
        .set({ isDefault: false, updatedAt: new Date().toISOString() })
        .run();
    }
  }
}
