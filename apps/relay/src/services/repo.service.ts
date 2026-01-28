import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type Repo, repos } from "../db/schema";

export interface UpsertRepoParams {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate?: boolean;
  description?: string;
  htmlUrl?: string;
  cloneUrl?: string;
  sshUrl?: string;
  defaultBranch?: string;
}

export type RepoRecord = Repo;

export class RepoService {
  constructor(private db: AppDatabase) {}

  /**
   * Get a repo by ID (GitHub full name).
   */
  get(repoId: string): RepoRecord | undefined {
    return this.db.select().from(repos).where(eq(repos.id, repoId)).get();
  }

  /**
   * List all repos, ordered by full name.
   */
  list(): RepoRecord[] {
    return this.db.select().from(repos).orderBy(asc(repos.fullName)).all();
  }

  /**
   * Insert or update a repo.
   */
  upsert(params: UpsertRepoParams): void {
    const now = new Date().toISOString();
    const existing = this.get(params.id);

    if (existing) {
      this.db
        .update(repos)
        .set({
          name: params.name,
          fullName: params.fullName,
          owner: params.owner,
          isPrivate: params.isPrivate ?? existing.isPrivate,
          description: params.description ?? existing.description,
          htmlUrl: params.htmlUrl ?? existing.htmlUrl,
          cloneUrl: params.cloneUrl ?? existing.cloneUrl,
          sshUrl: params.sshUrl ?? existing.sshUrl,
          defaultBranch: params.defaultBranch ?? existing.defaultBranch,
          updatedAt: now,
        })
        .where(eq(repos.id, params.id))
        .run();
    } else {
      this.db
        .insert(repos)
        .values({
          id: params.id,
          name: params.name,
          fullName: params.fullName,
          owner: params.owner,
          isPrivate: params.isPrivate ?? false,
          description: params.description ?? null,
          htmlUrl: params.htmlUrl ?? null,
          cloneUrl: params.cloneUrl ?? null,
          sshUrl: params.sshUrl ?? null,
          defaultBranch: params.defaultBranch ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }

  /**
   * Delete a repo by ID.
   */
  delete(repoId: string): void {
    this.db.delete(repos).where(eq(repos.id, repoId)).run();
  }
}
