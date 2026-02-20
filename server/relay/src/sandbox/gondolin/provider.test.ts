import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, assert, beforeAll, describe, expect, it } from "vitest";
import { GondolinSandboxProvider } from "./provider";

/**
 * Integration tests for GondolinSandboxProvider.
 * Requires KVM and gondolin guest assets.
 *
 * To run: RUN_GONDOLIN_TESTS=1 pnpm test provider.test.ts
 *
 * Skipped automatically if RUN_GONDOLIN_TESTS is not set.
 * In CI, the probe step verifies gondolin works before these run.
 */
describe("GondolinSandboxProvider", () => {
  let provider: GondolinSandboxProvider;
  let sessionDataDir: string;

  const skip = !process.env.RUN_GONDOLIN_TESTS;

  beforeAll(() => {
    sessionDataDir = join(tmpdir(), `gondolin-test-${Date.now()}`);
    mkdirSync(sessionDataDir, { recursive: true });

    provider = new GondolinSandboxProvider({
      sessionDataDir,
      imagePath: process.env.GONDOLIN_IMAGE_OUT,
    });
  });

  afterAll(async () => {
    if (!skip) {
      await provider.cleanup();
    }
    rmSync(sessionDataDir, { recursive: true, force: true });
  });

  describe("exec", () => {
    it.skipIf(skip)(
      "runs a command inside the VM",
      { timeout: 60_000 },
      async () => {
        const sessionId = `test-exec-${Date.now()}`;
        const handle = await provider.createSandbox({
          sessionId,
          secrets: { ANTHROPIC_API_KEY: "sk-test-dummy" },
        });

        const result = await handle.exec?.("echo hello from gondolin");
        assert(result);
        expect(result.exitCode).toBe(0);
        expect(result.output).toContain("hello from gondolin");

        await handle.terminate();
      },
    );

    it.skipIf(skip)(
      "returns non-zero exit code on failure",
      { timeout: 60_000 },
      async () => {
        const sessionId = `test-exec-fail-${Date.now()}`;
        const handle = await provider.createSandbox({
          sessionId,
          secrets: { ANTHROPIC_API_KEY: "sk-test-dummy" },
        });

        const result = await handle.exec?.("exit 42");
        assert(result);
        expect(result.exitCode).toBe(42);

        await handle.terminate();
      },
    );

    it.skipIf(skip)(
      "captures stderr in output",
      { timeout: 60_000 },
      async () => {
        const sessionId = `test-exec-stderr-${Date.now()}`;
        const handle = await provider.createSandbox({
          sessionId,
          secrets: { ANTHROPIC_API_KEY: "sk-test-dummy" },
        });

        const result = await handle.exec?.("echo error >&2");
        assert(result);
        expect(result.output).toContain("error");

        await handle.terminate();
      },
    );
  });
});
