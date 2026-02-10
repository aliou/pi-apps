import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { type Event, events, sessions } from "../db/schema";

export type JournalEntry = Event;

export class EventJournal {
  constructor(private db: AppDatabase) {}

  /**
   * Append an event to the journal.
   * Automatically assigns the next seq number for the session.
   * Returns the assigned seq.
   */
  append(sessionId: string, type: string, payload: unknown): number {
    const now = new Date().toISOString();

    // Get next seq in a transaction
    const nextSeq = this.db.transaction((tx) => {
      const maxSeqResult = tx
        .select({ maxSeq: sql<number>`COALESCE(MAX(${events.seq}), 0)` })
        .from(events)
        .where(eq(events.sessionId, sessionId))
        .get();

      const seq = (maxSeqResult?.maxSeq ?? 0) + 1;

      tx.insert(events)
        .values({
          sessionId,
          seq,
          type,
          payload: JSON.stringify(payload),
          createdAt: now,
        })
        .run();

      return seq;
    });

    return nextSeq;
  }

  /**
   * Get events after a given seq number.
   * Returns events in ascending order by seq.
   */
  getAfterSeq(
    sessionId: string,
    afterSeq: number,
    limit?: number,
  ): JournalEntry[] {
    let query = this.db
      .select()
      .from(events)
      .where(and(eq(events.sessionId, sessionId), gt(events.seq, afterSeq)))
      .orderBy(asc(events.seq))
      .$dynamic();

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query.all();
  }

  /**
   * Get the most recent N events for a session.
   * Returns events in ascending order by seq.
   */
  getRecent(sessionId: string, limit: number): JournalEntry[] {
    // Get the most recent N events, then reverse to ascending order
    const recent = this.db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .orderBy(desc(events.seq))
      .limit(limit)
      .all();

    // Reverse to ascending order
    return recent.reverse();
  }

  /**
   * Get the maximum seq for a session.
   * Returns 0 if no events exist.
   */
  getMaxSeq(sessionId: string): number {
    const result = this.db
      .select({ maxSeq: sql<number>`COALESCE(MAX(${events.seq}), 0)` })
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .get();

    return result?.maxSeq ?? 0;
  }

  /**
   * Delete all events for a session.
   */
  deleteForSession(sessionId: string): void {
    this.db.delete(events).where(eq(events.sessionId, sessionId)).run();
  }

  /**
   * Prune events older than cutoff date.
   * Only prunes events for archived sessions.
   * Returns number of events deleted.
   */
  pruneOlderThan(cutoffDate: string): number {
    // Get sessions that are archived
    const prunableSessions = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.status, ["archived"]))
      .all();

    if (prunableSessions.length === 0) {
      return 0;
    }

    const sessionIds = prunableSessions.map((s) => s.id);

    const result = this.db
      .delete(events)
      .where(
        and(
          inArray(events.sessionId, sessionIds),
          lt(events.createdAt, cutoffDate),
        ),
      )
      .run();

    return result.changes;
  }
}
