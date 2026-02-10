import { getContainer, switchPort } from "@cloudflare/containers";
import { Hono } from "hono";
import { authMiddleware } from "./auth";
import type { Env } from "./env";

export type { Env } from "./env";

/**
 * Validate that a sandbox ID matches the expected format.
 * Must be 1-128 alphanumeric characters, hyphens, or underscores.
 */
function validateSandboxId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

const app = new Hono<{ Bindings: Env }>();

// Auth on all routes (skips /health internally)
app.use("*", authMiddleware);

// Health check -- no DO interaction
app.get("/health", (c) => c.json({ status: "ok" }));

// Create sandbox (or ensure it exists)
app.post("/api/sandboxes/:id", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const body = await c.req.json();
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(
    new Request("http://container/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
});

// Get sandbox status
app.get("/api/sandboxes/:id/status", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(new Request("http://container/status"));
});

// Pause (save state + stop)
app.post("/api/sandboxes/:id/pause", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(
    new Request("http://container/pause", { method: "POST" }),
  );
});

// Resume (restore state + start)
app.post("/api/sandboxes/:id/resume", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const body = await c.req.json().catch(() => ({}));
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(
    new Request("http://container/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
});

// Terminate (destroy + delete state)
app.delete("/api/sandboxes/:id", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(
    new Request("http://container/terminate", { method: "POST" }),
  );
});

// Execute a command inside the container (forwarded to bridge's /exec)
app.post("/api/sandboxes/:id/exec", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const body = await c.req.json();
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(
    new Request("http://container/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
});

// List all sandboxes -- not implemented.
// CF DOs don't have a "list all instances" API. The relay server's DB is
// the source of truth for session tracking.
app.get("/api/sandboxes", (c) => {
  return c.json(
    { data: null, error: "Not implemented -- relay DB is source of truth" },
    501,
  );
});

// WebSocket upgrade -- forwarded to the container's bridge on port 4000
app.get("/ws/sandboxes/:id", async (c) => {
  const id = c.req.param("id");
  if (!validateSandboxId(id)) {
    return c.json({ error: "Invalid sandbox ID format" }, { status: 400 });
  }
  const container = getContainer(c.env.PI_SANDBOX, id);
  return container.fetch(switchPort(c.req.raw, 4000));
});

export { PiSandbox } from "./sandbox";
export default app;
