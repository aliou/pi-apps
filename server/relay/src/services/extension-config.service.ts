import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type ExtensionConfig, extensionConfigs } from "../db/schema";
import type { ExtensionManifest } from "./extension-manifest.service";

export type ExtensionScope = "global" | "chat" | "code" | "session";

export interface AddExtensionPackageParams {
  scope: ExtensionScope;
  package: string;
  sessionId?: string;
  config?: Record<string, unknown>;
}

export interface UpdateExtensionConfigParams {
  config?: Record<string, unknown>;
}

export interface ExtensionFieldError {
  field: string;
  message: string;
}

export interface ExtensionConfigValidationResult {
  valid: boolean;
  errors: ExtensionFieldError[];
}

export interface ResolvedExtensionPackage {
  package: string;
  config: Record<string, unknown>;
}

export class ExtensionConfigService {
  constructor(private db: AppDatabase) {}

  add(params: AddExtensionPackageParams) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const existing = this.findExact(
      params.scope,
      params.package,
      params.sessionId,
    );
    if (existing) {
      if (params.config) {
        this.update(existing.id, { config: params.config });
        return this.get(existing.id) ?? existing;
      }
      return existing;
    }

    this.db
      .insert(extensionConfigs)
      .values({
        id,
        scope: params.scope,
        sessionId: params.sessionId ?? null,
        package: params.package,
        configJson: params.config ? JSON.stringify(params.config) : null,
        createdAt: now,
      })
      .run();

    return this.get(id);
  }

  get(id: string): ExtensionConfig | undefined {
    return this.db
      .select()
      .from(extensionConfigs)
      .where(eq(extensionConfigs.id, id))
      .get();
  }

  remove(id: string): void {
    this.db.delete(extensionConfigs).where(eq(extensionConfigs.id, id)).run();
  }

  update(
    id: string,
    params: UpdateExtensionConfigParams,
  ): ExtensionConfig | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;

    this.db
      .update(extensionConfigs)
      .set({
        configJson:
          params.config === undefined
            ? existing.configJson
            : JSON.stringify(params.config),
      })
      .where(eq(extensionConfigs.id, id))
      .run();

    return this.get(id);
  }

  listByScope(scope: ExtensionScope, sessionId?: string): ExtensionConfig[] {
    if (scope === "session") {
      if (!sessionId) return [];
      return this.db
        .select()
        .from(extensionConfigs)
        .where(
          and(
            eq(extensionConfigs.scope, "session"),
            eq(extensionConfigs.sessionId, sessionId),
          ),
        )
        .all();
    }

    return this.db
      .select()
      .from(extensionConfigs)
      .where(
        and(
          eq(extensionConfigs.scope, scope),
          isNull(extensionConfigs.sessionId),
        ),
      )
      .all();
  }

  getResolvedPackages(sessionId: string, mode: "chat" | "code"): string[] {
    return this.getResolvedPackageEntries(sessionId, mode).map(
      (entry) => entry.package,
    );
  }

  getResolvedPackageEntries(
    sessionId: string,
    mode: "chat" | "code",
  ): ResolvedExtensionPackage[] {
    const rows = this.db
      .select()
      .from(extensionConfigs)
      .where(inArray(extensionConfigs.scope, ["global", mode, "session"]))
      .all()
      .sort(
        (a, b) =>
          scopePriority(a.scope as ExtensionScope, mode) -
          scopePriority(b.scope as ExtensionScope, mode),
      );

    const packages = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.scope === "session" && row.sessionId !== sessionId) {
        continue;
      }

      const prev = packages.get(row.package) ?? {};
      const next = { ...prev, ...this.parseConfig(row.configJson) };
      packages.set(row.package, next);
    }

    return [...packages.entries()].map(([pkg, config]) => ({
      package: pkg,
      config,
    }));
  }

  validateConfig(
    config: Record<string, unknown> | undefined,
    manifest: ExtensionManifest | null,
  ): ExtensionConfigValidationResult {
    if (!manifest?.schema?.properties) {
      return { valid: true, errors: [] };
    }

    const value = config ?? {};
    const required = new Set(manifest.schema.required ?? []);
    const errors: ExtensionFieldError[] = [];

    for (const field of required) {
      const fieldValue = value[field];
      if (
        fieldValue === undefined ||
        fieldValue === null ||
        (typeof fieldValue === "string" && fieldValue.trim() === "")
      ) {
        errors.push({ field, message: "Required" });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private parseConfig(configJson: string | null): Record<string, unknown> {
    if (!configJson) return {};

    try {
      const parsed = JSON.parse(configJson) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  private findExact(
    scope: ExtensionScope,
    pkg: string,
    sessionId?: string,
  ): ExtensionConfig | undefined {
    if (sessionId) {
      return this.db
        .select()
        .from(extensionConfigs)
        .where(
          and(
            eq(extensionConfigs.scope, scope),
            eq(extensionConfigs.sessionId, sessionId),
            eq(extensionConfigs.package, pkg),
          ),
        )
        .get();
    }

    return this.db
      .select()
      .from(extensionConfigs)
      .where(
        and(
          eq(extensionConfigs.scope, scope),
          isNull(extensionConfigs.sessionId),
          eq(extensionConfigs.package, pkg),
        ),
      )
      .get();
  }
}

function scopePriority(scope: ExtensionScope, mode: "chat" | "code"): number {
  if (scope === "global") return 0;
  if (scope === mode) return 1;
  if (scope === "session") return 2;
  return 3;
}
