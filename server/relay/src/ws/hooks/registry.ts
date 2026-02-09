/**
 * Registry of hooks triggered when specific event types flow through
 * the WebSocket connection (in either direction).
 *
 * Hooks are strongly typed: the data parameter is narrowed to the
 * specific event/command shape matching the registered type.
 */

import type { ClientCommand, PiEvent } from "../types";

/** Union of all messages that flow through a connection. */
type AllMessages = PiEvent | ClientCommand;

/** All valid type strings. */
export type MessageType = AllMessages["type"];

/** Narrow the union to the member(s) matching a given type string. */
export type MessageByType<T extends MessageType> = Extract<
  AllMessages,
  { type: T }
>;

export type EventHook<T extends MessageType> = (
  sessionId: string,
  data: MessageByType<T>,
) => void;

export class EventHookRegistry {
  private hooks = new Map<
    string,
    Array<(sessionId: string, data: never) => void>
  >();

  /**
   * Register a hook for a given message type.
   * The hook receives the correctly-typed payload for that type.
   */
  on<T extends MessageType>(type: T, hook: EventHook<T>): void {
    const existing = this.hooks.get(type);
    if (existing) {
      existing.push(hook as (sessionId: string, data: never) => void);
    } else {
      this.hooks.set(type, [hook as (sessionId: string, data: never) => void]);
    }
  }

  /**
   * Run all registered hooks for the given type.
   * Errors in individual hooks are logged but do not propagate.
   */
  handle(sessionId: string, type: string, data: unknown): void {
    const hooks = this.hooks.get(type);
    if (!hooks) return;

    for (const hook of hooks) {
      try {
        hook(sessionId, data as never);
      } catch (err) {
        console.error(
          `[event-hook] error for type=${type} session=${sessionId}:`,
          err,
        );
      }
    }
  }
}
