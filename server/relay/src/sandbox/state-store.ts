/**
 * Interface for persisting and restoring sandbox state.
 *
 * Docker's bind mounts mean state already survives pause/resume,
 * so its implementation is effectively a no-op.
 * Cloud providers will implement this against their own storage
 * (R2, DO storage, etc.) to save workspace files and pi session JSONL
 * before lossy pause and restore after resume/recreate.
 */
export interface SandboxStateStore {
  /**
   * Save sandbox state for a session.
   * Called before lossy pause or scheduled backup.
   * Implementation decides what to persist (workspace files, agent JSONL, etc.).
   */
  save(sessionId: string): Promise<void>;

  /**
   * Restore sandbox state for a session.
   * Called after resume/recreate to repopulate the sandbox filesystem.
   */
  restore(sessionId: string): Promise<void>;

  /**
   * Check whether saved state exists for a session.
   * Used to decide whether restore is needed after recreate.
   */
  exists(sessionId: string): Promise<boolean>;
}

/**
 * No-op state store for providers with persistent local storage (e.g., Docker bind mounts).
 * State already survives pause/resume, so save/restore are no-ops.
 */
export class NoOpStateStore implements SandboxStateStore {
  async save(_sessionId: string): Promise<void> {
    // No-op: Docker bind mounts persist state on the host.
  }

  async restore(_sessionId: string): Promise<void> {
    // No-op: State is already present via bind mounts.
  }

  async exists(_sessionId: string): Promise<boolean> {
    // Always true: bind-mounted directories are always present.
    return true;
  }
}
