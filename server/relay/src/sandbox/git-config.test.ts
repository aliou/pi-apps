import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeGitConfig } from "./git-config";

describe("writeGitConfig", () => {
  let gitDir: string;

  afterEach(() => {
    if (gitDir) {
      rmSync(gitDir, { recursive: true, force: true });
    }
  });

  function setup(opts: Parameters<typeof writeGitConfig>[1]) {
    gitDir = join(tmpdir(), `git-config-test-${Date.now()}`);
    writeGitConfig(gitDir, opts);
    return {
      gitconfig: readFileSync(join(gitDir, "gitconfig"), "utf-8"),
      helper: readFileSync(join(gitDir, "git-credential-helper"), "utf-8"),
    };
  }

  it("writes credential helper with token", () => {
    const { helper } = setup({
      githubToken: "ghp_abc123",
      credentialHelperPath: "/git",
    });
    expect(helper).toContain("password=ghp_abc123");
    expect(helper).toContain("username=x-access-token");
  });

  it("writes empty helper without token", () => {
    const { helper } = setup({ credentialHelperPath: "/git" });
    expect(helper).toBe("#!/bin/sh\n");
  });

  it("uses default author when not provided", () => {
    const { gitconfig } = setup({ credentialHelperPath: "/git" });
    expect(gitconfig).toContain('name = "pi-sandbox"');
    expect(gitconfig).toContain('email = "pi-sandbox@noreply.github.com"');
  });

  it("uses custom author when provided", () => {
    const { gitconfig } = setup({
      credentialHelperPath: "/git",
      gitAuthorName: "Test User",
      gitAuthorEmail: "test@example.com",
    });
    expect(gitconfig).toContain('name = "Test User"');
    expect(gitconfig).toContain('email = "test@example.com"');
  });

  it("includes credential helper path in gitconfig when token present", () => {
    const { gitconfig } = setup({
      githubToken: "ghp_abc123",
      credentialHelperPath: "/data/git",
    });
    expect(gitconfig).toContain("helper = /data/git/git-credential-helper");
  });

  it("omits credential section when no token", () => {
    const { gitconfig } = setup({ credentialHelperPath: "/git" });
    expect(gitconfig).not.toContain("[credential]");
  });
});
