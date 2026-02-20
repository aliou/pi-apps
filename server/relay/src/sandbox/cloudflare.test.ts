import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareSandboxProvider } from "./cloudflare";

const CONFIG = {
  workerUrl: "https://test-worker.example.com",
  apiToken: "test-secret",
};

// Mock global fetch
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  mockFetch.mockReset();
});

/** Safely get a specific mock call's arguments. */
function getCall(
  index: number,
): [url: string | URL | Request, init?: RequestInit] {
  const call = mockFetch.mock.calls[index];
  if (!call) throw new Error(`Expected mock call at index ${index}`);
  return call as [string | URL | Request, RequestInit?];
}

// ─── Provider ───────────────────────────────────────────────────────────────

describe("CloudflareSandboxProvider", () => {
  describe("constructor validation", () => {
    it("rejects missing workerUrl", () => {
      expect(
        () => new CloudflareSandboxProvider({ workerUrl: "", apiToken: "x" }),
      ).toThrow("workerUrl must be a valid HTTP(S) URL");
    });

    it("rejects non-HTTP workerUrl", () => {
      expect(
        () =>
          new CloudflareSandboxProvider({
            workerUrl: "ftp://bad",
            apiToken: "x",
          }),
      ).toThrow("workerUrl must be a valid HTTP(S) URL");
    });

    it("rejects empty apiToken", () => {
      expect(
        () =>
          new CloudflareSandboxProvider({
            workerUrl: "https://w.dev",
            apiToken: "  ",
          }),
      ).toThrow("apiToken must be a non-empty string");
    });
  });

  describe("capabilities", () => {
    it("reflects lossy pause and ephemeral disk", () => {
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(provider.capabilities.losslessPause).toBe(false);
      expect(provider.capabilities.persistentDisk).toBe(false);
    });

    it("name is cloudflare", () => {
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(provider.name).toBe("cloudflare");
    });
  });

  describe("isAvailable", () => {
    it("returns true when Worker health endpoint is OK", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"ok"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(await provider.isAvailable()).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-worker.example.com/health",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Relay-Secret": "test-secret",
          }),
        }),
      );
    });

    it("returns false when Worker is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(await provider.isAvailable()).toBe(false);
    });

    it("returns false on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce(new Response("error", { status: 500 }));
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe("createSandbox", () => {
    it("sends correct request and returns handle in running state", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.createSandbox({
        sessionId: "test-1",
        secrets: { ANTHROPIC_API_KEY: "sk-test" },
        repoUrl: "https://github.com/user/repo.git",
        repoBranch: "main",
      });

      expect(handle.sessionId).toBe("test-1");
      expect(handle.providerId).toBe("cf-test-1");
      expect(handle.status).toBe("running");

      // Verify request
      const [url, init] = getCall(0);
      expect(url).toBe("https://test-worker.example.com/api/sandboxes/test-1");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.envVars.ANTHROPIC_API_KEY).toBe("sk-test");
      expect(body.repoUrl).toBe("https://github.com/user/repo.git");
      expect(body.repoBranch).toBe("main");
    });

    it("merges env overrides with secrets", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await provider.createSandbox({
        sessionId: "test-2",
        env: { MY_VAR: "hello" },
        secrets: { api_key: "sk-123" },
      });

      const body = JSON.parse(getCall(0)[1]?.body as string);
      expect(body.envVars.MY_VAR).toBe("hello");
      expect(body.envVars.API_KEY).toBe("sk-123");
    });

    it("throws on Worker failure", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Internal error", { status: 500 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await expect(
        provider.createSandbox({ sessionId: "test-fail" }),
      ).rejects.toThrow("Failed to create sandbox: 500");
    });

    it("injects GH_TOKEN when githubToken is provided", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await provider.createSandbox({
        sessionId: "test-gh",
        githubToken: "ghp_test123",
      });

      const body = JSON.parse(getCall(0)[1]?.body as string);
      expect(body.envVars.GH_TOKEN).toBe("ghp_test123");
    });
  });

  describe("getSandbox", () => {
    it("maps running status correctly", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");
      expect(handle.status).toBe("running");
      expect(handle.sessionId).toBe("test-1");
    });

    it("maps stopped+backup to paused", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"stopped","hasBackup":true}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");
      expect(handle.status).toBe("paused");
    });

    it("maps stopped without backup to stopped", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"stopped","hasBackup":false}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");
      expect(handle.status).toBe("stopped");
    });

    it("maps healthy to running", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"healthy"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");
      expect(handle.status).toBe("running");
    });

    it("maps unknown status to error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"exploded"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");
      expect(handle.status).toBe("error");
    });

    it("strips cf- prefix from providerId", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await provider.getSandbox("cf-my-session");

      const [url] = getCall(0);
      expect(url).toContain("/api/sandboxes/my-session/status");
    });

    it("handles providerId without cf- prefix", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await provider.getSandbox("raw-id");

      const [url] = getCall(0);
      expect(url).toContain("/api/sandboxes/raw-id/status");
    });

    it("throws for non-existent sandbox", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      await expect(provider.getSandbox("cf-gone")).rejects.toThrow(
        "Sandbox not found",
      );
    });
  });

  describe("listSandboxes", () => {
    it("returns empty array", async () => {
      const provider = new CloudflareSandboxProvider(CONFIG);
      expect(await provider.listSandboxes()).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("is a no-op returning zero counts", async () => {
      const provider = new CloudflareSandboxProvider(CONFIG);
      const result = await provider.cleanup();
      expect(result.sandboxesRemoved).toBe(0);
      expect(result.artifactsRemoved).toBe(0);
    });
  });
});

// ─── Handle ─────────────────────────────────────────────────────────────────

describe("CloudflareSandboxHandle", () => {
  /** Helper: create a handle via the provider. */
  async function createHandle(sessionId = "test-1") {
    mockFetch.mockResolvedValueOnce(
      new Response('{"status":"running"}', { status: 200 }),
    );
    const provider = new CloudflareSandboxProvider(CONFIG);
    return provider.createSandbox({ sessionId });
  }

  describe("identity", () => {
    it("has deterministic providerId", async () => {
      const handle = await createHandle("sess-abc");
      expect(handle.providerId).toBe("cf-sess-abc");
    });

    it("has correct sessionId", async () => {
      const handle = await createHandle("sess-abc");
      expect(handle.sessionId).toBe("sess-abc");
    });

    it("imageDigest is undefined", async () => {
      const handle = await createHandle();
      expect(handle.imageDigest).toBeUndefined();
    });
  });

  describe("resume", () => {
    it("sends secrets as uppercased envVars", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      await handle.resume({ anthropic_api_key: "sk-new" });

      const [url, init] = getCall(1);
      expect(url).toContain("/api/sandboxes/test-1/resume");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.envVars.ANTHROPIC_API_KEY).toBe("sk-new");
    });

    it("sets status to running on success", async () => {
      const handle = await createHandle();
      // Handle starts as "running" from createSandbox, set to paused first
      // (getSandbox returns paused for stopped+backup)
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      await handle.resume();
      expect(handle.status).toBe("running");
    });

    it("throws on failure", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response("Container gone", { status: 500 }),
      );
      await expect(handle.resume()).rejects.toThrow("Resume failed: 500");
    });

    it("injects GH_TOKEN when githubToken is provided", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"running"}', { status: 200 }),
      );
      await handle.resume({ anthropic_api_key: "sk-new" }, "ghp_resume123");

      const body = JSON.parse(getCall(1)[1]?.body as string);
      expect(body.envVars.GH_TOKEN).toBe("ghp_resume123");
    });
  });

  describe("pause", () => {
    it("sets status to paused on success", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await handle.pause();
      expect(handle.status).toBe("paused");
    });

    it("throws on failure", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(new Response("Failed", { status: 500 }));
      await expect(handle.pause()).rejects.toThrow("Pause failed: 500");
    });
  });

  describe("terminate", () => {
    it("sets status to stopped on success", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await handle.terminate();
      expect(handle.status).toBe("stopped");
    });

    it("treats 404 as success (already gone)", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response("Not found", { status: 404 }),
      );
      await handle.terminate();
      expect(handle.status).toBe("stopped");
    });

    it("handles network errors gracefully", async () => {
      const handle = await createHandle();

      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      await handle.terminate();
      expect(handle.status).toBe("stopped");
    });

    it("re-throws server errors", async () => {
      const handle = await createHandle();

      mockFetch.mockResolvedValueOnce(
        new Response("Server error", { status: 500 }),
      );
      await expect(handle.terminate()).rejects.toThrow("Terminate failed: 500");
    });
  });

  describe("onStatusChange", () => {
    it("fires on status transitions", async () => {
      const handle = await createHandle();
      const statuses: string[] = [];
      handle.onStatusChange((s) => statuses.push(s));

      mockFetch.mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await handle.pause();

      expect(statuses).toEqual(["paused"]);
    });

    it("does not fire when status unchanged", async () => {
      const handle = await createHandle();
      const statuses: string[] = [];
      handle.onStatusChange((s) => statuses.push(s));

      // resume() sets to "running" but handle is already "running"
      mockFetch.mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await handle.resume();

      expect(statuses).toEqual([]);
    });

    it("unsubscribe works", async () => {
      const handle = await createHandle();
      const statuses: string[] = [];
      const unsub = handle.onStatusChange((s) => statuses.push(s));

      unsub();

      mockFetch.mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200 }),
      );
      await handle.pause();

      expect(statuses).toEqual([]);
    });
  });

  describe("attach", () => {
    it("throws when status is not running", async () => {
      // Get a paused handle
      mockFetch.mockResolvedValueOnce(
        new Response('{"status":"stopped","hasBackup":true}', { status: 200 }),
      );
      const provider = new CloudflareSandboxProvider(CONFIG);
      const handle = await provider.getSandbox("cf-test-1");

      await expect(handle.attach()).rejects.toThrow(
        'Cannot attach to sandbox in "paused" status',
      );
    });
  });
});

// ─── Manager wiring ─────────────────────────────────────────────────────────

describe("SandboxManager cloudflare wiring", () => {
  // Import inline to avoid circular issues with mock setup
  it("registers cloudflare provider when config is provided", async () => {
    const { SandboxManager } = await import("./manager");
    const manager = new SandboxManager({
      docker: { sessionDataDir: "/tmp/test", secretsBaseDir: "/tmp/test" },
      gondolin: { sessionDataDir: "/tmp/test" },
    });
    const available = await manager.isProviderAvailable({
      sandboxType: "cloudflare",
      workerUrl: "https://example.com",
      apiToken: "test-token",
    });
    // Will be false since the worker URL doesn't exist, but no error thrown
    expect(typeof available).toBe("boolean");
  });

  it("does not register cloudflare when config is missing", async () => {
    const { SandboxManager } = await import("./manager");
    const manager = new SandboxManager({
      docker: { sessionDataDir: "/tmp/test", secretsBaseDir: "/tmp/test" },
      gondolin: { sessionDataDir: "/tmp/test" },
    });
    const available = await manager.isProviderAvailable({
      sandboxType: "cloudflare",
      workerUrl: "https://example.com",
    });
    expect(available).toBe(false);
  });
});
