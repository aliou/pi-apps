import { createLogger } from "../lib/logger";
import type { EventJournal } from "../services/event-journal";
import type { PiEvent, ServerEvent } from "./types";

const logger = createLogger("replay");

export interface ReplayParams {
  sessionId: string;
  fromSeq: number;
  journal: EventJournal;
  send: (event: ServerEvent) => void;
}

/**
 * Replay missed events from the journal to a client.
 *
 * Sends:
 * - replay_start event with fromSeq/toSeq
 * - All Pi events from journal (parsed from stored payloads)
 * - replay_end event
 *
 * Returns the last sequence number replayed (toSeq), or fromSeq if no events.
 */
export async function replayFromSeq(params: ReplayParams): Promise<number> {
  const { sessionId, fromSeq, journal, send } = params;

  const events = journal.getAfterSeq(sessionId, fromSeq);
  if (events.length === 0) {
    return fromSeq;
  }

  const lastEvent = events[events.length - 1];
  if (!lastEvent) {
    return fromSeq;
  }

  const toSeq = lastEvent.seq;

  send({ type: "replay_start", fromSeq, toSeq });

  for (const event of events) {
    try {
      const payload = JSON.parse(event.payload) as PiEvent;
      send(payload);
    } catch (err) {
      logger.error(
        { err, sessionId, seq: event.seq },
        "skipping malformed replay event",
      );
    }
  }

  send({ type: "replay_end" });

  return toSeq;
}
