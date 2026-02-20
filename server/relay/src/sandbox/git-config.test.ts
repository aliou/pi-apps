import { existsSync, readFileSync, rmSync } from "node:fs";
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
      tokenFile: existsSync(join(gitDir, "git-credential-token"))
        ? readFileSync(join(gitDir, "git-credential-token"), "utf-8")
        : null,
    };
  }

  it("writes token to separate file and helper reads from it", () => {
    const { helper, tokenFile } = setup({
      githubToken: "ghp_abc123",
      credentialHelperPath: "/git",
    });
    expect(tokenFile).toBe("ghp_abc123");
    expect(helper).toContain("git-credential-token");
    expect(helper).not.toContain("ghp_abc123");
  });

  it("does not embed token with shell metacharacters in helper script", () => {
    const { helper, tokenFile } = setup({
      githubToken: '$(evil) `cmd` "quotes" $VAR',
      credentialHelperPath: "/git",
    });
    expect(tokenFile).toBe('$(evil) `cmd` "quotes" $VAR');
    expect(helper).not.toContain("$(evil)");
    expect(helper).not.toContain("`cmd`");
  });

  it("writes empty helper without token", () => {
    const { helper, tokenFile } = setup({ credentialHelperPath: "/git" });
    expect(helper).toBe("#!/bin/sh\n");
    expect(tokenFile).toBeNull();
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
