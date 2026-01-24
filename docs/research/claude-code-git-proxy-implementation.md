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

---

## Integration with Pi-Apps Sandbox RFC (Issue #5)

The [Sandbox Abstraction RFC](https://github.com/aliou/pi-apps/issues/5) proposes a compute abstraction layer for running Pi in isolated environments. The Git proxy fits naturally into this architecture.

### Architectural Alignment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Pi-Apps Server                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        Session Manager                                  │ │
│  │  - Creates session with unique ID                                       │ │
│  │  - Generates session-scoped JWT (for Git proxy auth)                    │ │
│  │  - Creates unique branch: `claude/<task-id>-<session-id>`               │ │
│  │  - Manages session lifecycle (pause/resume/backup)                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│           ┌────────────────────────┼────────────────────────┐               │
│           ▼                        ▼                        ▼               │
│  ┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐ │
│  │  Git Proxy      │    │  Anthropic Proxy    │    │  Network Proxy      │ │
│  │  Service        │    │  (API credentials)  │    │  (Domain allowlist) │ │
│  │                 │    │                     │    │                     │ │
│  │  - Branch       │    │  - Injects API key  │    │  - npm, pip, etc.   │ │
│  │    restriction  │    │  - Rate limiting    │    │  - Blocks exfil     │ │
│  │  - Repo scoping │    │  - Usage tracking   │    │    domains          │ │
│  └────────┬────────┘    └──────────┬──────────┘    └──────────┬──────────┘ │
│           │                        │                          │             │
│           └────────────────────────┼──────────────────────────┘             │
│                                    │                                         │
│                          Unix Socket / Sidecar                               │
│                                    │                                         │
│  ┌─────────────────────────────────▼───────────────────────────────────────┐│
│  │                     ComputeProvider Abstraction                          ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐   ││
│  │  │  Local  │  │ Docker  │  │  Modal  │  │  Koyeb  │  │ Cloudflare  │   ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────────┘   ││
│  │                                                                          ││
│  │  Sandbox runs: pi --mode rpc                                             ││
│  │  - No direct network access                                              ││
│  │  - Only session JWT credential inside                                    ││
│  │  - Filesystem restricted to /workspace                                   ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Integration Points with RFC Interfaces

#### 1. Extend `CreateSandboxOptions` for Git Configuration

```typescript
interface CreateSandboxOptions {
  // Existing from RFC
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;

  // New: Git proxy configuration
  git?: {
    repository: string;           // "owner/repo"
    allowedBranch: string;        // "claude/fix-123-abc"
    sessionToken: string;         // Session-scoped JWT
    allowedOperations?: ('push' | 'fetch' | 'clone')[];
  };

  // New: Credential proxy endpoints
  proxies?: {
    git?: string;        // "http://host:8080" - Git credential proxy
    anthropic?: string;  // "http://host:8081" - API key injection proxy
    network?: string;    // "http://host:8082" - General HTTP proxy
  };
}
```

#### 2. Extend `SandboxHandle` for Git Status

```typescript
interface SandboxHandle {
  // Existing from RFC
  sendPrompt(prompt: string): Promise<void>;
  onEvent(handler: (event: SandboxEvent) => void): void;
  pause(): Promise<SandboxBackup>;
  resume(backup: SandboxBackup): Promise<void>;
  terminate(): Promise<void>;

  // New: Git operation hooks
  onGitOperation?(handler: (op: GitOperation) => void): void;
  getGitAuditLog?(): Promise<GitAuditEntry[]>;
}

interface GitOperation {
  type: 'push' | 'fetch' | 'clone' | 'pull';
  repository: string;
  branch?: string;
  timestamp: Date;
  allowed: boolean;
  reason?: string;  // If denied, why
}
```

#### 3. Provider-Specific Network Configuration

Each compute provider needs different network isolation setup:

```typescript
// Docker Provider
class DockerComputeProvider implements ComputeProvider {
  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    // Network isolation via Docker
    const containerConfig = {
      NetworkMode: 'none',  // No direct network
      // Mount proxy socket
      Binds: [
        '/var/run/pi-proxy.sock:/var/run/proxy.sock:ro'
      ],
      Env: [
        // Git uses proxy socket
        `GIT_PROXY_COMMAND=/usr/bin/git-proxy-wrapper`,
        `GIT_CREDENTIAL_HELPER=/usr/bin/session-credential-helper`,
        `SESSION_TOKEN=${options.git?.sessionToken}`,
        // HTTP traffic via proxy
        `HTTP_PROXY=http://proxy.sock:8080`,
        `HTTPS_PROXY=http://proxy.sock:8080`,
      ]
    };
    // ...
  }
}

// Modal Provider
class ModalComputeProvider implements ComputeProvider {
  async createSandbox(options: CreateSandboxOptions): Promise<SandboxHandle> {
    // Modal uses gVisor - configure network policy
    const sandbox = await modal.Sandbox.create({
      network_file_systems: {},  // No network FS
      // Proxy sidecar for network access
      proxy: {
        git: options.proxies?.git,
        http: options.proxies?.network,
      },
      secrets: [
        // Only session token, not real credentials
        modal.Secret.from_dict({ SESSION_TOKEN: options.git?.sessionToken })
      ]
    });
    // ...
  }
}
```

### Session Lifecycle with Git Integration

#### Session Creation Flow

```typescript
async function createSession(userId: string, repoUrl: string): Promise<Session> {
  // 1. Parse repository
  const repo = parseGitUrl(repoUrl);  // { owner: "foo", name: "bar" }

  // 2. Create unique session branch
  const sessionId = generateSessionId();
  const branchName = `claude/${taskId}-${sessionId}`;

  // 3. Generate session-scoped JWT
  const sessionToken = jwt.sign({
    sessionId,
    userId,
    repository: `${repo.owner}/${repo.name}`,
    allowedBranch: branchName,
    allowedOperations: ['push', 'fetch', 'clone'],
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)  // 24h
  }, process.env.JWT_SECRET);

  // 4. Create the branch on GitHub (using server's real credentials)
  await createBranch(repo, branchName, 'main');

  // 5. Create sandbox with Git configuration
  const sandbox = await computeProvider.createSandbox({
    timeoutMs: 3600000,
    git: {
      repository: `${repo.owner}/${repo.name}`,
      allowedBranch: branchName,
      sessionToken,
    },
    proxies: {
      git: process.env.GIT_PROXY_URL,
      anthropic: process.env.ANTHROPIC_PROXY_URL,
      network: process.env.NETWORK_PROXY_URL,
    }
  });

  // 6. Clone repo inside sandbox
  await sandbox.sendPrompt(`Clone the repository and checkout ${branchName}`);

  return { sessionId, sandbox, branchName };
}
```

#### Session Backup/Restore with Git State

The RFC mentions backup/restore for session continuity. Git state needs special handling:

```typescript
interface SandboxBackup {
  // Existing from RFC
  sessionId: string;
  timestamp: Date;
  filesystemSnapshot: Buffer;  // Or reference to cloud storage

  // New: Git state
  git?: {
    lastCommit: string;        // SHA of last commit
    uncommittedChanges: boolean;
    branch: string;
  };
}

async function backupSession(handle: SandboxHandle): Promise<SandboxBackup> {
  // 1. Commit any uncommitted changes
  await handle.sendPrompt('git add -A && git commit -m "Session backup" || true');

  // 2. Push to remote (via proxy)
  await handle.sendPrompt('git push origin HEAD');

  // 3. Get git state
  const gitState = await handle.exec('git rev-parse HEAD');

  // 4. Create backup
  return handle.pause();
}

async function restoreSession(backup: SandboxBackup): Promise<SandboxHandle> {
  // 1. Create new sandbox
  const handle = await computeProvider.createSandbox(/* ... */);

  // 2. Clone and checkout the backed-up commit
  await handle.sendPrompt(`git clone ... && git checkout ${backup.git?.lastCommit}`);

  // 3. Restore filesystem state
  await handle.resume(backup);

  return handle;
}
```

### Phased Implementation Recommendation

Building on the RFC's phased approach:

| Phase | RFC Scope | Git Proxy Addition |
|-------|-----------|-------------------|
| **Phase 1** | Abstraction layer, no behavior change | Add Git proxy interfaces to types |
| **Phase 2** | Docker provider | Implement Git proxy with Docker network isolation |
| **Phase 3** | Backup/restore | Add git state to backup, handle uncommitted changes |
| **Phase 4** | Cloud providers (Modal, Koyeb) | Adapt Git proxy for cloud sandbox network policies |

### Git Proxy Service Implementation

The Git proxy should be a standalone service that all sandbox providers connect to:

```typescript
// packages/server/src/services/git-proxy.ts

import express from 'express';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const app = express();

app.use('/git/*', async (req, res) => {
  // 1. Extract session token from git credential
  const authHeader = req.headers.authorization;
  const sessionToken = extractSessionToken(authHeader);

  // 2. Validate JWT
  const claims = validateSessionToken(sessionToken);
  if (!claims) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // 3. Parse git operation from URL and body
  const gitOp = parseGitRequest(req);

  // 4. Validate operation against session claims
  if (gitOp.type === 'receive-pack') {  // Push
    const targetBranch = extractPushBranch(req);
    if (targetBranch !== claims.allowedBranch) {
      // Log the violation
      await auditLog.record({
        sessionId: claims.sessionId,
        operation: 'push',
        targetBranch,
        allowed: false,
        reason: `Branch ${targetBranch} not allowed, expected ${claims.allowedBranch}`
      });
      return res.status(403).json({
        error: `Push denied: can only push to ${claims.allowedBranch}`
      });
    }
  }

  // 5. Validate repository
  const targetRepo = extractRepository(req);
  if (targetRepo !== claims.repository) {
    return res.status(403).json({ error: 'Repository access denied' });
  }

  // 6. Log successful operation
  await auditLog.record({
    sessionId: claims.sessionId,
    operation: gitOp.type,
    repository: targetRepo,
    branch: gitOp.branch,
    allowed: true
  });

  // 7. Inject real GitHub credentials and forward
  req.headers.authorization = `Basic ${Buffer.from(
    `x-access-token:${process.env.GITHUB_TOKEN}`
  ).toString('base64')}`;

  proxy.web(req, res, {
    target: 'https://github.com',
    changeOrigin: true
  });
});

app.listen(process.env.GIT_PROXY_PORT || 8080);
```

### Configuration Example

```typescript
// packages/server/src/config/sandbox.ts

export const sandboxConfig = {
  providers: {
    local: { enabled: true },
    docker: {
      enabled: true,
      networkMode: 'none',
      proxySocket: '/var/run/pi-proxy.sock'
    },
    modal: {
      enabled: false,
      // Modal-specific config
    }
  },

  proxies: {
    git: {
      port: 8080,
      jwtSecret: process.env.GIT_PROXY_JWT_SECRET,
      githubToken: process.env.GITHUB_TOKEN,
      auditLogPath: '/var/log/pi/git-audit.log'
    },
    anthropic: {
      port: 8081,
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    network: {
      port: 8082,
      allowedDomains: [
        'registry.npmjs.org',
        'pypi.org',
        'files.pythonhosted.org',
        // ... package registries
      ],
      deniedDomains: [
        '*.pastebin.com',
        '*.requestbin.com',
        // ... exfiltration vectors
      ]
    }
  },

  session: {
    tokenExpiry: '24h',
    branchPrefix: 'claude/',
    maxConcurrentSessions: 10
  }
};
```

## Sources

- [Simon Willison's Blog: Claude Code for Web](https://simonwillison.net/2025/Oct/20/claude-code-for-web/)
- [Anthropic Engineering: Making Claude Code More Secure and Autonomous](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Claude Code Documentation: Claude Code on the Web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Claude Code Documentation: Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Anthropic Sandbox Runtime (GitHub)](https://github.com/anthropic-experimental/sandbox-runtime)
- [Agent Quickstart (Claude Code inspired)](https://github.com/lebovic/agent-quickstart)
- [FINOS GitProxy](https://git-proxy.finos.org)
