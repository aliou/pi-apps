import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_GIT_AUTHOR_NAME = "pi-sandbox";
export const DEFAULT_GIT_AUTHOR_EMAIL = "pi-sandbox@noreply.github.com";

export interface GitConfigOptions {
  githubToken?: string;
  gitAuthorName?: string;
  gitAuthorEmail?: string;
  /** Path prefix for the credential helper inside the sandbox (e.g. "/git" or "/data/git") */
  credentialHelperPath: string;
}

/**
 * Write gitconfig and credential helper to the given directory.
 * Shared between Docker and Gondolin providers.
 */
export function writeGitConfig(gitDir: string, opts: GitConfigOptions): void {
  const { githubToken, credentialHelperPath } = opts;
  mkdirSync(gitDir, { recursive: true });

  if (githubToken) {
    // Write token to a separate file to avoid shell injection via metacharacters.
    writeFileSync(join(gitDir, "git-credential-token"), githubToken, {
      mode: 0o600,
    });
  }
  const helperScript = githubToken
    ? [
        "#!/bin/sh",
        `TOKEN=$(cat "$(dirname "$0")/git-credential-token")`,
        'printf "protocol=https\\nhost=github.com\\nusername=x-access-token\\npassword=%s\\n" "$TOKEN"',
        "",
      ].join("\n")
    : "#!/bin/sh\n";
  writeFileSync(join(gitDir, "git-credential-helper"), helperScript, {
    mode: 0o700,
  });

  const name = opts.gitAuthorName || DEFAULT_GIT_AUTHOR_NAME;
  const email = opts.gitAuthorEmail || DEFAULT_GIT_AUTHOR_EMAIL;
  const lines = [
    "[user]",
    `\tname = "${name}"`,
    `\temail = "${email}"`,
    "[safe]",
    "\tdirectory = /workspace",
  ];
  if (githubToken) {
    lines.push(
      "[credential]",
      `\thelper = ${credentialHelperPath}/git-credential-helper`,
    );
  }
  writeFileSync(join(gitDir, "gitconfig"), `${lines.join("\n")}\n`);
}
