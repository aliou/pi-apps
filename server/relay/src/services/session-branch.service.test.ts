import { describe, expect, it } from "vitest";
import {
  buildSessionBranchName,
  slugifyBranchBase,
} from "./session-branch.service";

describe("session-branch.service", () => {
  it("slugifies branch base with allowed chars only", () => {
    expect(slugifyBranchBase("Fix: Add OAuth + JWT (Phase 4)!")).toBe(
      "fix-add-oauth-jwt-phase-4",
    );
  });

  it("limits slug length to 48 chars", () => {
    const slug = slugifyBranchBase(
      "this is a very long branch title that should be trimmed to forty eight characters",
    );
    expect(slug.length).toBeLessThanOrEqual(48);
  });

  it("builds branch name with pi prefix and session uuid prefix", () => {
    const branch = buildSessionBranchName(
      "Implement file attachments",
      "12345678-abcd-ef00-1111-222233334444",
    );
    expect(branch).toBe("pi/implement-file-attachments-12345678");
  });
});
