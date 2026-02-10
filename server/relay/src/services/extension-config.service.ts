import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type ExtensionConfig, extensionConfigs } from "../db/schema";

export type ExtensionScope = "global" | "chat" | "code" | "session";

export interface AddExtensionPackageParams {
  scope: ExtensionScope;
  package: string;
  sessionId?: string;
}

export class ExtensionConfigService {
  constructor(private db: AppDatabase) {}

  /**
   * Add a package to a scope.
   * Returns the created record, or the existing one if it already exists.
   */
  add(params: AddExtensionPackageParams): ExtensionConfig {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check for existing entry first (SQLite unique indexes treat NULLs as distinct)
    const existing = this.findExact(
      params.scope,
      params.package,
      params.sessionId,
    );
    if (existing) return existing;

    this.db
      .insert(extensionConfigs)
      .values({
        id,
        scope: params.scope,
        sessionId: params.sessionId ?? null,
        package: params.package,
        createdAt: now,
      })
      .run();

    // biome-ignore lint/style/noNonNullAssertion: just inserted
    return this.get(id)!;
  }

  /**
   * Get a single extension config by ID.
   */
  get(id: string): ExtensionConfig | undefined {
    return this.db
      .select()
      .from(extensionConfigs)
      .where(eq(extensionConfigs.id, id))
      .get();
  }

  /**
   * Remove by ID.
   */
  remove(id: string): void {
    this.db.delete(extensionConfigs).where(eq(extensionConfigs.id, id)).run();
  }

  /**
   * List packages for a given scope.
   * For "session" scope, sessionId is required.
   * For "global", "chat", "code" scopes, sessionId is ignored.
   */
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

  /**
   * Resolve the merged, deduplicated list of packages for a session.
   * Merges: global + mode-level (chat or code) + session-level.
   */
  getResolvedPackages(sessionId: string, mode: "chat" | "code"): string[] {
    const rows = this.db
      .select()
      .from(extensionConfigs)
      .where(inArray(extensionConfigs.scope, ["global", mode, "session"]))
      .all();

    // Filter session-scoped rows to only this session
    const packages = new Set<string>();
    for (const row of rows) {
      if (row.scope === "session" && row.sessionId !== sessionId) {
        continue;
      }
      packages.add(row.package);
    }

    return [...packages];
  }

  /**
   * Find exact match for deduplication.
   */
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
