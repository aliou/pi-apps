import { describe, expect, it } from "vitest";
import { buildSandboxEnv, buildValidationEnv } from "./env";
import { buildValidationInstallCommand } from "./validation-command";

describe("gondolin env helpers", () => {
  it("buildSandboxEnv merges runtime vars with secrets only", () => {
    const env = buildSandboxEnv({
      sessionId: "session-1",
      secrets: { OPENAI_API_KEY: "sk-test", CUSTOM_VAR: "value" },
    });

    expect(env.PI_SESSION_ID).toBe("session-1");
    expect(env.PI_CODING_AGENT_DIR).toBe("/agent");
    expect(env.npm_config_prefix).toBe("/agent/npm");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.CUSTOM_VAR).toBe("value");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("buildValidationEnv does not inject provider fallback keys", () => {
    const env = buildValidationEnv();

    expect(env.PI_CODING_AGENT_DIR).toBe("/agent");
    expect(env.npm_config_prefix).toBe("/agent/npm");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });
});

describe("validation command", () => {
  it("passes package source as positional shell arg", () => {
    const source = "npm:pkg; echo injected";
    const command = buildValidationInstallCommand(source);

    expect(command).toEqual([
      "/bin/sh",
      "-lc",
      'pi install "$1"',
      "--",
      source,
    ]);
  });
});
