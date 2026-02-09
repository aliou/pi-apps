import type { SessionService } from "../../services/session.service";
import type { EventHookRegistry } from "./registry";

/**
 * Hook that captures the first user message for display fallback
 * when a session has no title.
 */
export function registerFirstMessageHook(
  hooks: EventHookRegistry,
  sessionService: SessionService,
): void {
  hooks.on("prompt", (sessionId, data) => {
    if (!data.message) return;
    const session = sessionService.get(sessionId);
    if (session && !session.firstUserMessage) {
      sessionService.update(sessionId, { firstUserMessage: data.message });
    }
  });
}
