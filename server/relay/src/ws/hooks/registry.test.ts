import { describe, expect, it, vi } from "vitest";
import { EventHookRegistry } from "./registry";

describe("EventHookRegistry", () => {
  it("hooks fire for matching type", () => {
    const registry = new EventHookRegistry();
    const mockHook = vi.fn();

    registry.on("response", mockHook);
    registry.handle("session-123", "response", { foo: "bar" });

    expect(mockHook).toHaveBeenCalledOnce();
    expect(mockHook).toHaveBeenCalledWith("session-123", { foo: "bar" });
  });

  it("hooks don't fire for non-matching type", () => {
    const registry = new EventHookRegistry();
    const mockHook = vi.fn();

    registry.on("response", mockHook);
    registry.handle("session-123", "prompt", { message: "hello" });

    expect(mockHook).not.toHaveBeenCalled();
  });

  it("multiple hooks on same type all fire", () => {
    const registry = new EventHookRegistry();
    const mockHook1 = vi.fn();
    const mockHook2 = vi.fn();
    const mockHook3 = vi.fn();

    registry.on("prompt", mockHook1);
    registry.on("prompt", mockHook2);
    registry.on("prompt", mockHook3);

    registry.handle("session-456", "prompt", { message: "test" });

    expect(mockHook1).toHaveBeenCalledOnce();
    expect(mockHook2).toHaveBeenCalledOnce();
    expect(mockHook3).toHaveBeenCalledOnce();

    expect(mockHook1).toHaveBeenCalledWith("session-456", { message: "test" });
    expect(mockHook2).toHaveBeenCalledWith("session-456", { message: "test" });
    expect(mockHook3).toHaveBeenCalledWith("session-456", { message: "test" });
  });

  it("error in one hook doesn't break others (and is caught)", () => {
    const registry = new EventHookRegistry();
    const errorHook = vi.fn(() => {
      throw new Error("Hook failed");
    });
    const successHook1 = vi.fn();
    const successHook2 = vi.fn();

    registry.on("extension_ui_request", successHook1);
    registry.on("extension_ui_request", errorHook);
    registry.on("extension_ui_request", successHook2);

    // Should not throw despite the error hook
    registry.handle("session-789", "extension_ui_request", {
      method: "setTitle",
    });

    // All hooks should have been called (error in one doesn't stop others)
    expect(successHook1).toHaveBeenCalledOnce();
    expect(errorHook).toHaveBeenCalledOnce();
    expect(successHook2).toHaveBeenCalledOnce();
  });
});
