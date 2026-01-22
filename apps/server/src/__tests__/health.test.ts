import { Hono } from "hono";
import { describe, expect, it } from "vitest";

// Minimal test app with just the health endpoint
function createTestApp() {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({ ok: true, version: "0.1.0" });
  });

  app.get("/", (c) => {
    return c.json({
      name: "pi-server",
      version: "0.1.0",
      endpoints: {
        websocket: "/rpc",
        health: "/health",
      },
    });
  });

  return app;
}

describe("Health endpoint", () => {
  const app = createTestApp();

  it("should return ok: true and version", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, version: "0.1.0" });
  });

  it("should return JSON content-type", async () => {
    const res = await app.request("/health");

    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("Info endpoint", () => {
  const app = createTestApp();

  it("should return server info with endpoints", async () => {
    const res = await app.request("/");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      name: "pi-server",
      version: "0.1.0",
      endpoints: {
        websocket: "/rpc",
        health: "/health",
      },
    });
  });
});
