# Claude Code Web Git Proxy Implementation Research

## Executive Summary

Claude Code Web uses a sophisticated multi-layered security architecture to restrict agent access to only the repository and branch it's working on. The key innovation is a **credential isolation pattern** where sensitive GitHub credentials never enter the sandbox - instead, a proxy service running outside the sandbox validates operations and injects credentials only after verification.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Isolated Sandbox (VM)                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Claude Code Agent                                          ││
│  │  - No real GitHub credentials                               ││
│  │  - Only has session-scoped JWT token                        ││
│  │  - All network traffic via Unix socket → proxy              ││
│  └──────────────────────┬──────────────────────────────────────┘│
│                         │ Unix Domain Socket                    │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│                    Git Proxy Service (Host)                      │
│  ┌──────────────────────▼──────────────────────────────────────┐│
│  │  1. Receives git request with scoped JWT credential         ││
│  │  2. Validates JWT authenticity                              ││
│  │  3. Inspects git operation (push, fetch, clone, etc.)       ││
│  │  4. Enforces branch restrictions (only session branch)      ││
│  │  5. Attaches real GitHub authentication token               ││
│  │  6. Forwards to GitHub                                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Real GitHub Token stored securely here, never enters sandbox   │
└──────────────────────────────────────────────────────────────────┘
```

## Key Security Components

### 1. Credential Isolation (Most Critical)

**The Problem:** If GitHub credentials are inside the sandbox, a compromised agent could:
- Push malicious code to any branch (including main/master)
- Access other repositories
- Exfiltrate credentials

**The Solution:** Credentials never enter the sandbox:
- **Inside sandbox:** Only a session-scoped JWT that's useless outside this specific session
- **Outside sandbox:** Git proxy holds the real GitHub token and only uses it after validation

### 2. Session-Scoped JWT Tokens

Each agent session receives a temporary JWT token that:
- Is unique to that specific session
- Can only be used to authenticate with the Git proxy (not directly with GitHub)
- Has embedded claims about which repository and branch it can access
- Expires when the session ends
- Can be revoked immediately if the session is compromised

### 3. Git Operation Validation

The proxy inspects the **contents** of git interactions before forwarding:

```
Validation Steps:
1. Parse the git protocol messages
2. Extract the target branch from push operations
3. Compare against the allowed session branch
4. Verify the repository matches the session repository
5. Check that the operation type is allowed (e.g., no force-push to protected branches)
```

**Branch Restriction:** The proxy ensures Claude can **only push to the configured branch** - typically a unique branch created for that session (e.g., `claude/fix-bug-abc123`).

### 4. Network Isolation via Unix Socket

All network access is routed through a Unix domain socket:

```
┌─────────────────┐     Unix Socket      ┌─────────────────┐
│   Sandbox       │ ──────────────────▶  │   Proxy Server  │
│   (No network)  │                      │   (Has network) │
└─────────────────┘                      └─────────────────┘
```

- The sandbox has **no direct network access**
- All traffic MUST go through the proxy
- The proxy can inspect, filter, and audit all requests

## Implementation Details

### Sandbox Runtime (Open Source)

Anthropic released their sandbox implementation as open source:
- **Repository:** https://github.com/anthropic-experimental/sandbox-runtime
- **NPM Package:** `@anthropic-ai/sandbox-runtime`
- **License:** Apache 2.0

**Platforms:**
- **macOS:** Uses Seatbelt (`sandbox-exec`)
- **Linux:** Uses Bubblewrap (`bwrap`) + seccomp BPF

### Network Proxy Architecture

The sandbox runtime includes dual proxy mechanisms:

```typescript
// Configuration structure
{
  sandbox: {
    network: {
      httpProxyPort: 8080,    // HTTP/HTTPS proxy
      socksProxyPort: 8081,   // SOCKS5 for SSH/git protocol
      allowedDomains: ["github.com", "api.github.com"],
      deniedDomains: []
    }
  }
}
```

**HTTP Proxy:** Intercepts HTTP/HTTPS requests, validates against domain allowlist
**SOCKS5 Proxy:** Handles SSH and raw TCP connections (git:// protocol)

### Linux Implementation (Bubblewrap)

```bash
# Example bubblewrap invocation
bwrap \
  --unshare-net \                    # Remove network namespace
  --bind /path/to/repo /workspace \  # Mount only the repo
  --ro-bind /usr /usr \              # Read-only system files
  --bind /path/to/socket /socket \   # Unix socket for proxy
  /bin/bash -c "your-command"
```

Key flags:
- `--unshare-net`: Removes network access completely
- Traffic routed through Unix socket using `socat`
- `seccomp BPF` filters block direct socket creation

### Git Credential Helper Configuration

Inside the sandbox, git is configured to use a custom credential helper:

```bash
# Git config inside sandbox
git config credential.helper '/path/to/session-credential-helper'
```

The credential helper returns the session-scoped JWT:
```
protocol=https
host=github.com
username=session-token
password=<session-jwt>
```

The proxy intercepts this and replaces it with real credentials.

## How to Implement in the Relay Server

This section maps the Git proxy architecture to the existing relay server codebase.
All file references below are relative to `apps/relay-server/src/`.

### Current State: What Already Exists

The relay server already implements a Docker sandbox with git credential
injection, but **the real GitHub token is embedded directly into the container**:

| Component | Status | Location |
|-----------|--------|----------|
| Docker sandbox provider | Implemented | `sandbox/docker.ts` |
| Session lifecycle (create/pause/resume) | Implemented | `services/session.service.ts` |
| Encrypted secrets (AES-256-GCM) | Implemented | `services/secrets.service.ts`, `services/crypto.service.ts` |
| Git credential helper (writes real token) | Implemented | `sandbox/docker.ts:368-388` |
| Ephemeral clone container | Implemented | `sandbox/docker.ts:390-456` |
| Sandbox types/interfaces | Implemented | `sandbox/types.ts` |
| GitHub token stored in settings | Implemented | `routes/sessions.ts:95-104` |
| Session-scoped JWT | **Missing** | — |
| Git proxy service | **Missing** | — |
| Network isolation (`--network=none`) | **Missing** (uses bridge) | `sandbox/docker.ts:70` |
| Branch restriction enforcement | **Missing** | — |
| Git operation audit log | **Missing** | — |

### Current Credential Flow (Insecure)

```
sessions.ts:96-104       docker.ts:168          docker.ts:372-376
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐
│ Read github_repos │    │ setupGitConfig() │    │ Credential helper script │
│ _access_token    │───▶│ writes real token │───▶│ echoes real token        │
│ from settings DB │    │ to host dir      │    │ mounted RO at /data/git  │
└──────────────────┘    └──────────────────┘    └──────────────────────────┘
                                                           │
                                                           ▼
                                                  Container has full
                                                  GitHub PAT access
```

**Risk:** A compromised agent can use the credential helper to push to any branch
on any repo the token has access to. The token is readable inside the container at
`/data/git/git-credential-helper` (mounted read-only, but the content is the raw PAT).

### Target Credential Flow (Proxy-Based)

```
sessions.ts              git-proxy.ts               docker.ts
┌──────────────────┐    ┌──────────────────────┐    ┌──────────────────────────┐
│ Generate session │    │ Git Proxy Service     │    │ Credential helper script │
│ JWT with branch  │    │ - Validates JWT       │    │ echoes session JWT only  │
│ claim            │    │ - Checks branch       │    │ (not the real PAT)       │
└───────┬──────────┘    │ - Injects real token  │    └──────────┬───────────────┘
        │               │ - Forwards to GitHub  │               │
        │               └───────────┬───────────┘               │
        │                           │                           │
        ▼                           ▼                           ▼
  JWT in /data/git            Real PAT stays             Container only
  (session-scoped,            on host, never             has a JWT that
   branch-locked)             enters container           is useless alone
```

### Step 1: Add a Session Token Service

New file: `services/session-token.service.ts`

This reuses the existing `CryptoService` (`services/crypto.service.ts`) for key
material. The `RELAY_ENCRYPTION_KEY` already exists in the config.

```typescript
// services/session-token.service.ts
import jwt from "jsonwebtoken";

export interface GitSessionClaims {
  sessionId: string;
  repository: string;      // "owner/repo" — from sessions.repoId resolution
  allowedBranch: string;   // from sessions.branchName
  ops: ("push" | "fetch" | "clone")[];
}

export class SessionTokenService {
  constructor(private readonly secret: string) {}

  /** Create a session-scoped JWT for the git proxy. */
  create(claims: GitSessionClaims): string {
    return jwt.sign(claims, this.secret, { expiresIn: "24h" });
  }

  /** Validate and decode. Returns null if invalid/expired. */
  verify(token: string): GitSessionClaims | null {
    try {
      return jwt.verify(token, this.secret) as GitSessionClaims;
    } catch {
      return null;
    }
  }
}
```

The `secret` can come from `RELAY_ENCRYPTION_KEY` (already required by the server
at `index.ts:57-70`) or a dedicated `GIT_PROXY_JWT_SECRET` env var.

### Step 2: Add the Git Proxy Service

New file: `services/git-proxy.service.ts`

The proxy runs as a Hono sub-app mounted on the relay server (same process,
different route prefix), or as a standalone service if preferred. It intercepts
the Git smart HTTP protocol endpoints (`/info/refs`, `/git-upload-pack`,
`/git-receive-pack`).

```typescript
// services/git-proxy.service.ts
import { Hono } from "hono";
import type { SessionTokenService } from "./session-token.service";

export function createGitProxyApp(
  tokenService: SessionTokenService,
  getGitHubToken: () => string | undefined,
) {
  const app = new Hono();

  // Intercept all Git smart HTTP requests
  // Git sends: GET  /<owner>/<repo>.git/info/refs?service=git-upload-pack
  //            POST /<owner>/<repo>.git/git-upload-pack   (fetch)
  //            POST /<owner>/<repo>.git/git-receive-pack  (push)
  app.all("/:owner/:repo{.+\\.git}/*", async (c) => {
    // 1. Extract session JWT from Basic auth (username=x-session-token)
    const authHeader = c.req.header("authorization") ?? "";
    const token = parseBasicAuthPassword(authHeader);

    // 2. Validate
    const claims = tokenService.verify(token);
    if (!claims) {
      return c.text("Invalid session token", 401);
    }

    // 3. Check repository matches
    const reqRepo = `${c.req.param("owner")}/${c.req.param("repo").replace(/\.git$/, "")}`;
    if (reqRepo !== claims.repository) {
      return c.text("Repository access denied", 403);
    }

    // 4. For push (git-receive-pack), validate branch
    const path = c.req.path;
    if (path.endsWith("/git-receive-pack")) {
      // Parse the pkt-line to extract the target ref
      const body = await c.req.arrayBuffer();
      const targetBranch = extractBranchFromReceivePack(Buffer.from(body));
      if (targetBranch && targetBranch !== `refs/heads/${claims.allowedBranch}`) {
        return c.text(
          `Push denied: can only push to ${claims.allowedBranch}`,
          403,
        );
      }
      // Re-forward the body to GitHub (we consumed it)
      return forwardToGitHub(c, getGitHubToken(), body);
    }

    // 5. Forward reads (fetch/clone) with real credentials
    return forwardToGitHub(c, getGitHubToken());
  });

  return app;
}
```

Mount it in `index.ts` alongside the existing API routes:

```typescript
// index.ts — alongside existing route mounts
import { createGitProxyApp } from "./services/git-proxy.service";

const gitProxy = createGitProxyApp(sessionTokenService, () => getGitHubToken(db));
app.route("/git", gitProxy);
```

### Step 3: Modify `setupGitConfig` to Use Session JWT

Change `sandbox/docker.ts:368-388` to write the session JWT instead of the real
GitHub token into the credential helper.

**Current** (`docker.ts:371-376`):
```typescript
const helperScript = githubToken
  ? `#!/bin/sh\necho "protocol=https\nhost=github.com\nusername=x-access-token\npassword=${githubToken}"\n`
  : "#!/bin/sh\n";
```

**Proposed:**
```typescript
// The credential helper now echoes the session JWT, not the real token.
// The git proxy intercepts this and swaps in the real GitHub PAT.
const helperScript = sessionToken
  ? [
      "#!/bin/sh",
      'echo "protocol=https"',
      `echo "host=${gitProxyHost}"`,  // Points to proxy, not github.com
      'echo "username=x-session-token"',
      `echo "password=${sessionToken}"`,
    ].join("\n") + "\n"
  : "#!/bin/sh\n";
```

The gitconfig also needs to route git traffic through the proxy:

**Current** (`docker.ts:378-387`):
```typescript
const lines = [
  "[user]",
  '\tname = "pi-sandbox"',
  '\temail = "pi-sandbox@noreply.github.com"',
];
if (githubToken) {
  lines.push("[credential]", "\thelper = /data/git/git-credential-helper");
}
```

**Proposed:**
```typescript
const lines = [
  "[user]",
  '\tname = "pi-sandbox"',
  '\temail = "pi-sandbox@noreply.github.com"',
];
if (sessionToken) {
  lines.push(
    "[credential]",
    "\thelper = /data/git/git-credential-helper",
    // Rewrite GitHub URLs to go through the proxy
    `[url "https://${gitProxyHost}/git/"]`,
    '\tinsteadOf = https://github.com/',
  );
}
```

### Step 4: Update `CreateSandboxOptions` and Session Route

**In `sandbox/types.ts`** — replace the raw `githubToken` field:

```typescript
export interface CreateSandboxOptions {
  sessionId: string;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  repoUrl?: string;
  repoBranch?: string;

  // Replace githubToken with session-scoped credential
  // githubToken?: string;          // REMOVE
  gitSessionToken?: string;         // ADD: session-scoped JWT for proxy auth
  gitProxyHost?: string;            // ADD: proxy endpoint (e.g. "host.docker.internal:31415")

  resources?: {
    cpuShares?: number;
    memoryMB?: number;
  };
  timeoutSec?: number;
}
```

**In `routes/sessions.ts`** — generate a session JWT instead of passing the raw
token (currently at lines 95-104 and 164-168):

```typescript
// Currently:
//   githubToken = JSON.parse(tokenSetting.value) as string;
//   ...passed to sandboxManager.createForSession({ githubToken })

// Proposed:
const githubToken = tokenSetting ? JSON.parse(tokenSetting.value) as string : undefined;
const gitSessionToken = sessionTokenService.create({
  sessionId: session.id,
  repository: `${repo.owner}/${repo.name}`,
  allowedBranch: repoBranch ?? "main",
  ops: ["push", "fetch", "clone"],
});

sandboxManager.createForSession(session.id, {
  repoUrl,
  repoBranch,
  gitSessionToken,                                   // Session JWT, not raw PAT
  gitProxyHost: `host.docker.internal:${PI_RELAY_PORT}`,
  secrets,
  resources: environmentConfig?.resources,
}, sandboxProvider);
```

The real `githubToken` stays in the settings DB and is only read by the Git proxy
service — it never reaches the sandbox creation path.

### Step 5: Switch Docker Network to `none` (Optional, Strict Mode)

Currently `sandbox/docker.ts:70` defaults to `"bridge"`. For full isolation:

```typescript
const DEFAULT_CONFIG = {
  image: "pi-sandbox:local",
  networkMode: "none",     // was: "bridge"
  containerPrefix: "pi-sandbox",
  // ...
};
```

When using `NetworkMode: "none"`, the container has no network at all. Traffic
to the git proxy (and package registries) must go through a mounted Unix socket
or a Docker network limited to the proxy sidecar.

**Sidecar approach** (simpler — proxy container on same Docker network):
```typescript
// Create an isolated Docker network per session
const network = await docker.createNetwork({
  Name: `pi-net-${sessionId}`,
  Internal: true,  // No external access
});
// Attach proxy container and sandbox container to this network
// Sandbox can reach proxy at "git-proxy:31415" but nothing else
```

**Unix socket approach** (stronger — matches Claude Code Web):
```typescript
binds.push(`${proxySocketPath}:/var/run/git-proxy.sock:ro`);
// git config insteadOf points to http+unix:///var/run/git-proxy.sock/
```

For the initial implementation, a simpler middle ground works: keep `bridge` mode
but have the credential helper point to the relay server's git proxy endpoint.
The token inside the container is just a JWT — even if exfiltrated, the proxy
still enforces branch restrictions.

### Step 6: Clone via Proxy (Replace Token-in-URL)

Currently `cloneRepoIntoDir` (`docker.ts:390-456`) embeds the raw PAT in the
clone URL. Replace this with a clone through the proxy:

```typescript
// Instead of:
//   `https://x-access-token:${githubToken}@github.com/${owner}/${repo}`
// Use:
//   `https://x-session-token:${sessionToken}@${gitProxyHost}/git/${owner}/${repo}.git`
```

The ephemeral clone container uses the proxy just like the main sandbox. The
proxy validates the session token and injects the real PAT for the clone.

### Summary of Files to Change

| File | Change |
|------|--------|
| `services/session-token.service.ts` | **New** — JWT create/verify |
| `services/git-proxy.service.ts` | **New** — HTTP proxy with branch enforcement |
| `index.ts` | Mount git proxy route, init SessionTokenService |
| `sandbox/types.ts` | Replace `githubToken` with `gitSessionToken` + `gitProxyHost` |
| `sandbox/docker.ts:368-388` | Credential helper writes JWT, gitconfig routes via proxy |
| `sandbox/docker.ts:390-456` | Clone via proxy URL instead of token-in-URL |
| `routes/sessions.ts:95-168` | Generate session JWT, keep real PAT server-side |

### Security Checklist

- [ ] Real GitHub PAT never enters the container (only session JWT)
- [ ] Session JWTs are short-lived (24h) and session-specific
- [ ] Branch restrictions enforced at proxy level (not in agent code)
- [ ] All git operations logged for audit in the event journal
- [ ] Repository access scoped to the specific repo for that session
- [ ] Force-push to branches other than the session branch is blocked
- [ ] JWT can be invalidated by terminating the session
- [ ] Clone also routes through proxy (no token-in-URL)

## Sources

- [Simon Willison's Blog: Claude Code for Web](https://simonwillison.net/2025/Oct/20/claude-code-for-web/)
- [Anthropic Engineering: Making Claude Code More Secure and Autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Claude Code Documentation: Claude Code on the Web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code Documentation: Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Anthropic Sandbox Runtime (GitHub)](https://github.com/anthropic-experimental/sandbox-runtime)
- [Agent Quickstart (Claude Code inspired)](https://github.com/lebovic/agent-quickstart)
- [FINOS GitProxy](https://git-proxy.finos.org)
