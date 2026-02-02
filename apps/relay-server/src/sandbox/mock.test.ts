import readline from "node:readline";
import { describe, expect, it } from "vitest";
import { MockSandboxProvider } from "./mock";

describe("MockSandboxProvider", () => {
  it("isAvailable returns true", async () => {
    const provider = new MockSandboxProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it("creates sandbox with correct sessionId", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    expect(handle.sessionId).toBe("test-session");
    expect(handle.providerId).toBe("mock-test-session");

    const streams = await handle.attach();
    expect(streams.stdin).toBeDefined();
    expect(streams.stdout).toBeDefined();
  });

  it("getSandbox returns existing sandbox by providerId", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    const retrieved = await provider.getSandbox("mock-test-session");
    expect(retrieved).toBe(handle);
  });

  it("getSandbox throws for unknown providerId", async () => {
    const provider = new MockSandboxProvider();
    await expect(provider.getSandbox("unknown")).rejects.toThrow(
      "Sandbox not found: unknown",
    );
  });

  it("status changes to running after creation", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    // Wait for status to change
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(handle.status).toBe("running");
  });

  it("onStatusChange notifies handlers", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    const statuses: string[] = [];
    handle.onStatusChange((status) => statuses.push(status));

    // Wait for status to change
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(statuses).toContain("running");
  });

  it("terminate stops the sandbox", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    await handle.terminate();
    expect(handle.status).toBe("stopped");
  });

  it("listSandboxes returns active sandboxes", async () => {
    const provider = new MockSandboxProvider();
    await provider.createSandbox({ sessionId: "test-session-1" });
    await provider.createSandbox({ sessionId: "test-session-2" });

    // Wait for sandboxes to start
    await new Promise((resolve) => setTimeout(resolve, 150));

    const sandboxes = await provider.listSandboxes();
    expect(sandboxes).toHaveLength(2);
    expect(sandboxes[0]?.status).toBe("running");
    expect(sandboxes[0]?.providerId).toContain("mock-");
  });

  it("cleanup removes stopped sandboxes", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    // Wait for running, then terminate
    await new Promise((resolve) => setTimeout(resolve, 150));
    await handle.terminate();

    const result = await provider.cleanup();
    expect(result.containersRemoved).toBe(1);
    expect(result.volumesRemoved).toBe(0);
  });
});

describe("MockSandboxHandle RPC", () => {
  it("responds to get_state command", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    // Wait for running status
    await new Promise((resolve) => setTimeout(resolve, 150));

    const streams = await handle.attach();
    const events: unknown[] = [];
    const rl = readline.createInterface({ input: streams.stdout });
    rl.on("line", (line) => {
      events.push(JSON.parse(line));
    });

    // Send get_state command
    streams.stdin.write(
      `${JSON.stringify({ type: "get_state", id: "cmd-1" })}\n`,
    );

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 100));

    const response = events.find(
      (e: unknown) => (e as Record<string, unknown>).type === "response",
    );
    expect(response).toBeDefined();
    expect((response as Record<string, unknown>).command).toBe("get_state");
    expect((response as Record<string, unknown>).success).toBe(true);
    expect((response as Record<string, unknown>).id).toBe("cmd-1");
  });

  it("responds to prompt command with events", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    // Wait for running status
    await new Promise((resolve) => setTimeout(resolve, 150));

    const streams = await handle.attach();
    const events: unknown[] = [];
    const rl = readline.createInterface({ input: streams.stdout });
    rl.on("line", (line) => {
      events.push(JSON.parse(line));
    });

    // Send prompt command
    streams.stdin.write(
      `${JSON.stringify({ type: "prompt", message: "hello", id: "cmd-2" })}\n`,
    );

    // Wait for generation to complete (mock types ~90 chars at 30ms/3chars = ~900ms + delays)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const eventTypes = events.map(
      (e: unknown) => (e as Record<string, unknown>).type,
    );
    expect(eventTypes).toContain("agent_start");
    expect(eventTypes).toContain("message_start");
    expect(eventTypes).toContain("message_update");
    expect(eventTypes).toContain("message_end");
    expect(eventTypes).toContain("agent_end");
  });

  it("abort stops ongoing generation", async () => {
    const provider = new MockSandboxProvider();
    const handle = await provider.createSandbox({ sessionId: "test-session" });

    // Wait for running status
    await new Promise((resolve) => setTimeout(resolve, 150));

    const streams = await handle.attach();
    const events: unknown[] = [];
    const rl = readline.createInterface({ input: streams.stdout });
    rl.on("line", (line) => {
      events.push(JSON.parse(line));
    });

    // Send prompt command
    streams.stdin.write(
      `${JSON.stringify({ type: "prompt", message: "test", id: "cmd-3" })}\n`,
    );

    // Send abort immediately
    await new Promise((resolve) => setTimeout(resolve, 50));
    streams.stdin.write(
      `${JSON.stringify({ type: "abort", id: "abort-1" })}\n`,
    );

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 200));

    const abortResponse = events.find(
      (e: unknown) =>
        (e as Record<string, unknown>).type === "response" &&
        (e as Record<string, unknown>).command === "abort",
    );
    expect(abortResponse).toBeDefined();
    expect((abortResponse as Record<string, unknown>).success).toBe(true);
  });
});
