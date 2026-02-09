import type { SessionService } from "../../services/session.service";
import type { EventHookRegistry } from "./registry";

/**
 * Hooks that persist the session name from two sources:
 * - get_state RPC response (data.sessionName)
 * - extension_ui_request with method=setTitle (title)
 */
export function registerSessionNameHooks(
  hooks: EventHookRegistry,
  sessionService: SessionService,
): void {
  hooks.on("response", (sessionId, data) => {
    if (data.command !== "get_state" || !data.success) return;
    // After narrowing on command + success, data.data is RpcSessionState
    const name = data.data.sessionName;
    if (!name) return;
    const session = sessionService.get(sessionId);
    if (session && session.name !== name) {
      sessionService.update(sessionId, { name });
    }
  });

  hooks.on("extension_ui_request", (sessionId, data) => {
    if (data.method !== "setTitle") return;
    // After narrowing on method, data.title is string
    const session = sessionService.get(sessionId);
    if (session && session.name !== data.title) {
      sessionService.update(sessionId, { name: data.title });
    }
  });
}
