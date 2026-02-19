import type { SessionService } from "../../services/session.service";
import { registerFirstMessageHook } from "./first-message";
import { EventHookRegistry } from "./registry";
import { registerSessionNameHooks } from "./session-name";

export type { EventHook } from "./registry";
export { EventHookRegistry } from "./registry";

/**
 * Build the event hook registry with all server-side hooks.
 */
export function buildEventHooks(
  sessionService: SessionService,
): EventHookRegistry {
  const hooks = new EventHookRegistry();
  registerSessionNameHooks(hooks, sessionService);
  registerFirstMessageHook(hooks, sessionService);
  return hooks;
}
