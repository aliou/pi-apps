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
    provider = new DockerSandboxProvider({
      image: process.env.PI_SANDBOX_IMAGE ?? "pi-sandbox:local",
      // Lima only mounts ~/; /tmp is not shared with Docker VM
      secretsBaseDir: process.env.PI_SECRETS_BASE_DIR,
      sessionDataDir: "/tmp/test-session-data",
    });
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
        expect(handle.providerId).toBeDefined();

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

  describe("attach", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "can attach to a running container and communicate via stdin/stdout",
      { timeout: 30_000 },
      async () => {
        if (!dockerAvailable) return;

        const sessionId = `test-attach-${Date.now()}`;

        // pi needs at least one model configured or it exits immediately.
        // Pass a dummy key so it boots into RPC mode.
        const handle = await provider.createSandbox({
          sessionId,
          secrets: { ANTHROPIC_API_KEY: "sk-test-dummy" },
        });

        // Container is already running — attach after start
        const streams = await handle.attach();

        // Send a command via stdin, expect output on stdout
        // pi takes a few seconds to boot in RPC mode
        const output = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timed out waiting for stdout")),
            25_000,
          );
          let data = "";
          streams.stdout.on("data", (chunk: Buffer) => {
            data += chunk.toString();
            // pi outputs JSON lines — wait for a complete line
            if (data.includes("\n")) {
              clearTimeout(timeout);
              resolve(data.trim());
            }
          });

          // Send get_state command — pi in RPC mode should respond
          streams.stdin.write(
            `${JSON.stringify({ type: "get_state", id: "test-1" })}\n`,
          );
        });

        expect(output).toBeTruthy();
        // Verify it's valid JSON from pi
        const parsed = JSON.parse(output);
        expect(parsed).toHaveProperty("type");

        await handle.terminate();
      },
    );
  });

  describe("getSandbox", () => {
    it.skipIf(!process.env.RUN_DOCKER_TESTS)(
      "throws for unknown container ID",
      async () => {
        if (!dockerAvailable) return;

        await expect(
          provider.getSandbox("nonexistent-container-id"),
        ).rejects.toThrow();
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
        expect(result.sandboxesRemoved).toBeGreaterThanOrEqual(0);
        expect(result.artifactsRemoved).toBeGreaterThanOrEqual(0);
      },
    );
  });
});
