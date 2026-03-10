import { describe, expect, it } from "vitest";
import { generateSessionTitle } from "./session-title.service";

describe("session-title.service", () => {
  it("returns deterministic trimmed title", () => {
    const title = generateSessionTitle({
      firstPrompt: "   Build a relay endpoint for share links   ",
      mode: "code",
    });

    expect(title).toBe("Build a relay endpoint for share links");
  });

  it("falls back by mode when empty", () => {
    expect(generateSessionTitle({ firstPrompt: "", mode: "chat" })).toBe(
      "Chat session",
    );
    expect(generateSessionTitle({ firstPrompt: "", mode: "code" })).toBe(
      "Code session",
    );
  });
});
