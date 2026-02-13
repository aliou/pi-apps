import type { JournalEvent } from "./api";

interface CanonicalState {
  agentRunning: boolean;
  turnRunning: boolean;
  messageRole: string | null;
}

function stringifyPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "[unstringifiable-payload]";
  }
}

function semanticKey(event: JournalEvent): string {
  return `${event.type}:${stringifyPayload(event.payload)}`;
}

function isSemanticDuplicate(
  prev: JournalEvent | null,
  current: JournalEvent,
): boolean {
  if (!prev) return false;
  return semanticKey(prev) === semanticKey(current);
}

function getPayload(event: JournalEvent): Record<string, unknown> {
  return typeof event.payload === "object" && event.payload !== null
    ? (event.payload as Record<string, unknown>)
    : {};
}

function getAssistantEventType(event: JournalEvent): string | undefined {
  const payload = getPayload(event);
  const assistantMessageEvent = payload.assistantMessageEvent;

  if (
    typeof assistantMessageEvent === "object" &&
    assistantMessageEvent !== null &&
    typeof (assistantMessageEvent as { type?: unknown }).type === "string"
  ) {
    return (assistantMessageEvent as { type: string }).type;
  }

  return undefined;
}

function getMessageRole(event: JournalEvent): string | null {
  const payload = getPayload(event);

  if (typeof payload.role === "string") {
    return payload.role;
  }

  const message = payload.message;
  if (
    typeof message === "object" &&
    message !== null &&
    typeof (message as { role?: unknown }).role === "string"
  ) {
    return (message as { role: string }).role;
  }

  const assistantMessageEvent = payload.assistantMessageEvent;
  if (
    typeof assistantMessageEvent === "object" &&
    assistantMessageEvent !== null &&
    typeof (assistantMessageEvent as { role?: unknown }).role === "string"
  ) {
    return (assistantMessageEvent as { role: string }).role;
  }

  return null;
}

function shouldKeepEvent(event: JournalEvent, state: CanonicalState): boolean {
  switch (event.type) {
    case "agent_start": {
      if (state.agentRunning) return false;
      state.agentRunning = true;
      return true;
    }

    case "agent_end": {
      if (!state.agentRunning) return false;
      state.agentRunning = false;
      return true;
    }

    case "turn_start": {
      if (state.turnRunning) return false;
      state.turnRunning = true;
      return true;
    }

    case "turn_end": {
      if (!state.turnRunning) return false;
      state.turnRunning = false;
      return true;
    }

    case "message_start": {
      const role = getMessageRole(event) ?? "unknown";
      if (state.messageRole === role) return false;
      state.messageRole = role;
      return true;
    }

    case "message_update": {
      if (state.messageRole) return true;

      const updateType = getAssistantEventType(event);
      if (updateType === "text_end" || updateType === "thinking_end") {
        return false;
      }

      const role = getMessageRole(event);
      if (role) {
        state.messageRole = role;
      }

      return true;
    }

    case "message_end": {
      if (!state.messageRole) return false;
      state.messageRole = null;
      return true;
    }

    default:
      return true;
  }
}

/**
 * Merge, sort, and canonicalize events.
 *
 * Canonicalization rules:
 * - keep one event per seq
 * - drop adjacent semantic duplicates (same type + same payload)
 * - drop invalid duplicate lifecycle transitions (start/start, end/end)
 */
export function mergeCanonicalEvents(
  current: JournalEvent[],
  incoming: JournalEvent[],
): JournalEvent[] {
  const bySeq = new Map<number, JournalEvent>();

  for (const event of current) {
    bySeq.set(event.seq, event);
  }

  for (const event of incoming) {
    bySeq.set(event.seq, event);
  }

  const sorted = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
  const canonical: JournalEvent[] = [];
  const state: CanonicalState = {
    agentRunning: false,
    turnRunning: false,
    messageRole: null,
  };

  for (const event of sorted) {
    if (!shouldKeepEvent(event, state)) continue;

    const prev = canonical[canonical.length - 1] ?? null;
    if (isSemanticDuplicate(prev, event)) continue;

    canonical.push(event);
  }

  return canonical;
}
