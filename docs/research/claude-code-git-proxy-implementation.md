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

## How to Implement for Your Server

### Option 1: Use Anthropic's Sandbox Runtime Directly

```bash
# Install
npm install -g @anthropic-ai/sandbox-runtime

# Run command in sandbox
npx @anthropic-ai/sandbox-runtime "git clone https://github.com/user/repo"
```

### Option 2: Build Custom Git Proxy

#### Step 1: Create Session JWT Service

```typescript
// session-token-service.ts
import jwt from 'jsonwebtoken';

interface SessionClaims {
  sessionId: string;
  repository: string;          // e.g., "owner/repo"
  allowedBranch: string;       // e.g., "claude/fix-bug-123"
  allowedOperations: string[]; // e.g., ["push", "fetch", "clone"]
  expiresAt: number;
}

function createSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, process.env.JWT_SECRET, {
    expiresIn: '24h'
  });
}
```

#### Step 2: Build Git Proxy Server

```typescript
// git-proxy.ts
import { createServer } from 'http';
import { spawn } from 'child_process';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function handleGitRequest(req, res) {
  // 1. Extract session JWT from request
  const sessionJwt = extractCredential(req);

  // 2. Validate JWT
  const claims = validateAndDecodeJwt(sessionJwt);
  if (!claims) {
    return res.status(401).send('Invalid session token');
  }

  // 3. Parse git operation
  const gitOp = parseGitOperation(req);

  // 4. Validate branch restriction
  if (gitOp.type === 'push') {
    if (gitOp.targetBranch !== claims.allowedBranch) {
      return res.status(403).send(
        `Push denied: can only push to ${claims.allowedBranch}`
      );
    }
  }

  // 5. Validate repository
  if (gitOp.repository !== claims.repository) {
    return res.status(403).send('Repository access denied');
  }

  // 6. Forward to GitHub with real credentials
  const githubReq = injectGitHubAuth(req, GITHUB_TOKEN);
  const response = await forwardToGitHub(githubReq);

  return res.send(response);
}
```

#### Step 3: Configure Git Inside Sandbox

```bash
# Set proxy for git operations
export HTTP_PROXY=http://localhost:8080
export HTTPS_PROXY=http://localhost:8080

# Or configure git specifically
git config --global http.proxy http://localhost:8080
git config --global credential.helper '/path/to/session-helper'
```

### Option 3: Use FINOS GitProxy

GitProxy is an open-source project that provides similar functionality:
- **Website:** https://git-proxy.finos.org
- **Features:** Push interception, approval workflows, audit logging

## Recommended Architecture for Pi-Apps

```
┌─────────────────────────────────────────────────────────────────┐
│                     Pi-Apps Server                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Session Manager                                          │   │
│  │  - Creates unique branch per session                      │   │
│  │  - Generates session-scoped JWT                           │   │
│  │  - Tracks session state                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Git Proxy Service                                        │   │
│  │  - Validates session JWTs                                 │   │
│  │  - Enforces branch restrictions                           │   │
│  │  - Injects GitHub credentials                             │   │
│  │  - Logs all operations for audit                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Agent Sandbox (Docker/Bubblewrap/Modal)                  │   │
│  │  - No network except via proxy socket                     │   │
│  │  - Session JWT as only credential                         │   │
│  │  - Filesystem restricted to repo directory                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Implementation Steps

1. **Session Initialization:**
   - Create unique branch: `claude/<task-id>-<session-id>`
   - Generate session JWT with branch claim
   - Clone repo into isolated sandbox

2. **Git Proxy Middleware:**
   - Parse git-upload-pack and git-receive-pack protocols
   - Validate branch on push operations
   - Replace session credential with real GitHub token

3. **Sandbox Setup:**
   - Use Docker with `--network=none` + proxy sidecar
   - Or use Bubblewrap with `--unshare-net`
   - Mount only the repository directory

4. **Credential Flow:**
   ```
   Agent → Session JWT → Proxy → GitHub Token → GitHub
   ```

## Security Checklist

- [ ] Credentials never enter the sandbox
- [ ] Session JWTs are short-lived and session-specific
- [ ] Branch restrictions are enforced at proxy level (not in agent)
- [ ] All git operations are logged for audit
- [ ] Network isolation prevents direct GitHub access
- [ ] Repository access is scoped to the specific repo only
- [ ] Force-push to protected branches is blocked
- [ ] JWT can be revoked if session is compromised

## Sources

- [Simon Willison's Blog: Claude Code for Web](https://simonwillison.net/2025/Oct/20/claude-code-for-web/)
- [Anthropic Engineering: Making Claude Code More Secure and Autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Claude Code Documentation: Claude Code on the Web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code Documentation: Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Anthropic Sandbox Runtime (GitHub)](https://github.com/anthropic-experimental/sandbox-runtime)
- [Agent Quickstart (Claude Code inspired)](https://github.com/lebovic/agent-quickstart)
- [FINOS GitProxy](https://git-proxy.finos.org)
