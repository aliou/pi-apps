import type { MiddlewareHandler } from "hono";
import type { Env } from "./env";

/**
 * Validates the X-Relay-Secret header on all requests except /health.
 * The secret is set via `wrangler secret put RELAY_SECRET`.
 */
export const authMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (
  c,
  next,
) => {
  if (c.req.path === "/health") {
    return next();
  }

  const secret = c.req.header("X-Relay-Secret");
  if (!secret || secret !== c.env.RELAY_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
};
