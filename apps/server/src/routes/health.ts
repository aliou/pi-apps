/**
 * Health and info HTTP endpoints.
 */

import { Hono } from "hono";

const VERSION = "0.1.0";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  return c.json({ ok: true, version: VERSION });
});

healthRoutes.get("/", (c) => {
  return c.json({
    name: "pi-server",
    version: VERSION,
    endpoints: {
      websocket: "/rpc",
      health: "/health",
    },
  });
});
