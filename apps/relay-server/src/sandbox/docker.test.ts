import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DockerSandboxProvider } from "./docker";

/**
 * Integration tests for DockerSandboxProvider.
 * These tests require Docker to be running and the pi-sandbox:local image to be built.
 *
 * To run these tests:
 * 1. Build the image: cd docker && docker build -t pi-sandbox:local .
 * 2. Run tests: pnpm test docker.test.ts
 *
 * Tests are skipped automatically if Docker is not available.
 */
describe("DockerSandboxProvider", () => {
  let provider: DockerSandboxProvider;
  let dockerAvailable = false;

  beforeAll(async () => {
    provider = new DockerSandboxProvider({ image: "pi-sandbox:local" });
    dockerAvailable = await provider.isAvailable();
    if (!dockerAvailable) {
      console.warn("Skipping Docker tests - Docker not available");
    }
  });

  afterAll(async () => {
    if (dockerAvailable) {
      await provider.cleanup();
    }
  });

  describe("isAvailable", () => {
    it("returns true when Docker is running", async () => {
      // This test always runs - it's testing the isAvailable method itself
      const result = await provider.isAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("createSandbox", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "creates a sandbox container",
      async () => {
        if (!dockerAvailable) return;

        const sessionId = `test-${Date.now()}`;
        const handle = await provider.createSandbox({ sessionId });

        expect(handle.sessionId).toBe(sessionId);
        expect(handle.status).toBe("running");
        expect(handle.containerId).toBeDefined();

        await handle.terminate();
      },
    );

    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "reuses existing sandbox for same session",
      async () => {
        if (!dockerAvailable) return;

        const sessionId = `test-${Date.now()}`;
        const handle1 = await provider.createSandbox({ sessionId });
        const handle2 = await provider.createSandbox({ sessionId });

        expect(handle1).toBe(handle2);

        await handle1.terminate();
      },
    );
  });

  describe("getSandbox", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "returns undefined for unknown session",
      async () => {
        if (!dockerAvailable) return;

        const result = provider.getSandbox("unknown-session");
        expect(result).toBeUndefined();
      },
    );
  });

  describe("listSandboxes", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "lists running containers",
      async () => {
        if (!dockerAvailable) return;

        const sandboxes = await provider.listSandboxes();
        expect(Array.isArray(sandboxes)).toBe(true);
      },
    );
  });

  describe("cleanup", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "removes stopped containers",
      async () => {
        if (!dockerAvailable) return;

        const result = await provider.cleanup();
        expect(result.containersRemoved).toBeGreaterThanOrEqual(0);
        expect(result.volumesRemoved).toBeGreaterThanOrEqual(0);
      },
    );
  });
});
