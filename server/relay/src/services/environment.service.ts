import { eq, ne } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type Environment, environments } from "../db/schema";
import type { SandboxResourceTier } from "../sandbox/provider-types";

export const SYSTEM_LOCAL_ENV_NAME = "Local";

export interface EnvironmentConfig {
  image?: string;
  workerUrl?: string;
  secretId?: string;
  imagePath?: string;
  resourceTier?: SandboxResourceTier;
  idleTimeoutSeconds?: number;
  envVars?: Array<{ key: string; value: string }>;
  workspaceMode?: "github-clone" | "local-directory" | "git-worktree";
  repoUrl?: string;
  repoBranch?: string;
  localPath?: string;
  worktreeRepoPath?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  systemManaged?: boolean;
}

export type SandboxType = "docker" | "cloudflare" | "gondolin" | "local";

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

export function validateEnvVars(
  envVars?: Array<{ key: string; value: string }>,
): string | null {
  if (!envVars || envVars.length === 0) {
    return null;
  }

  const keyPattern = /^[A-Z_][A-Z0-9_]*$/;
  const seenKeys = new Set<string>();

  for (let i = 0; i < envVars.length; i++) {
    const entry = envVars[i];
    if (!entry) return `envVars[${i}]: entry is required`;
    const { key, value } = entry;
    if (!key || typeof key !== "string") {
      return `envVars[${i}]: key is required and must be a string`;
    }
    if (!keyPattern.test(key)) {
      return `envVars[${i}]: key "${key}" must match pattern /^[A-Z_][A-Z0-9_]*$/ (uppercase letters, digits, underscore, must start with letter or underscore)`;
    }
    if (seenKeys.has(key)) {
      return `envVars: duplicate key "${key}" found`;
    }
    seenKeys.add(key);
    if (value !== undefined && typeof value !== "string") {
      return `envVars[${i}]: value must be a string when provided`;
    }
  }

  return null;
}

export class EnvironmentService {
  constructor(private db: AppDatabase) {}

  create(params: CreateEnvironmentParams): EnvironmentRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existingCount = this.list().length;
    const shouldDefault = params.isDefault ?? existingCount === 0;

    if (params.sandboxType === "local" && this.findSystemLocal()) {
      throw new Error("Local environment already exists");
    }

    if (shouldDefault) {
      this.clearOtherDefaults();
    }

    const newEnv = {
      id,
      name: params.name,
      sandboxType: params.sandboxType,
      config: JSON.stringify(params.config),
      isDefault: shouldDefault,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(environments).values(newEnv).run();
    const created = this.get(id);
    if (!created) throw new Error(`Failed to create environment: ${id}`);
    return created;
  }

  get(id: string): EnvironmentRecord | undefined {
    return this.db
      .select()
      .from(environments)
      .where(eq(environments.id, id))
      .get();
  }

  list(): EnvironmentRecord[] {
    return this.db.select().from(environments).all();
  }

  getDefault(): EnvironmentRecord | undefined {
    return this.db
      .select()
      .from(environments)
      .where(eq(environments.isDefault, true))
      .get();
  }

  update(id: string, params: UpdateEnvironmentParams): void {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`Environment not found: ${id}`);
    }

    if (params.isDefault) {
      this.clearOtherDefaults(id);
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (params.name !== undefined) updates.name = params.name;
    if (params.config !== undefined)
      updates.config = JSON.stringify(params.config);
    if (params.isDefault !== undefined) updates.isDefault = params.isDefault;

    this.db
      .update(environments)
      .set(updates)
      .where(eq(environments.id, id))
      .run();
  }

  delete(id: string): void {
    const existing = this.get(id);
    if (!existing) {
      return;
    }
    const config = JSON.parse(existing.config) as EnvironmentConfig;
    if (existing.sandboxType === "local" || config.systemManaged) {
      throw new Error("System-managed local environment cannot be deleted");
    }
    this.db.delete(environments).where(eq(environments.id, id)).run();
  }

  findSystemLocal(): EnvironmentRecord | undefined {
    return this.list().find((env) => {
      if (env.sandboxType !== "local") return false;
      const config = JSON.parse(env.config) as EnvironmentConfig;
      return (
        config.systemManaged === true || env.name === SYSTEM_LOCAL_ENV_NAME
      );
    });
  }

  upsertSystemLocal(config: EnvironmentConfig): EnvironmentRecord {
    const existing = this.findSystemLocal();
    const normalizedConfig: EnvironmentConfig = {
      workspaceMode: "local-directory",
      ...config,
      systemManaged: true,
    };

    if (existing) {
      const hasNonLocal = this.list().some((env) => env.id !== existing.id);
      this.update(existing.id, {
        name: SYSTEM_LOCAL_ENV_NAME,
        config: normalizedConfig,
        isDefault: existing.isDefault || !hasNonLocal,
      });
      const updated = this.get(existing.id);
      if (!updated)
        throw new Error(`Failed to update environment: ${existing.id}`);
      return updated;
    }

    const hasOtherEnvs = this.list().length > 0;
    return this.create({
      name: SYSTEM_LOCAL_ENV_NAME,
      sandboxType: "local",
      config: normalizedConfig,
      isDefault: !hasOtherEnvs,
    });
  }

  private clearOtherDefaults(exceptId?: string): void {
    if (exceptId) {
      this.db
        .update(environments)
        .set({ isDefault: false, updatedAt: new Date().toISOString() })
        .where(ne(environments.id, exceptId))
        .run();
      return;
    }

    this.db
      .update(environments)
      .set({ isDefault: false, updatedAt: new Date().toISOString() })
      .run();
  }
}
