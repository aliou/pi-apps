# Sandbox Docker Images

Docker images for running [pi](https://github.com/mariozechner/pi-coding-agent) inside sandboxed containers. The relay server creates one container per session.

## Images

| Image | Base | Use Case |
|---|---|---|
| `sandbox-alpine-arm64` | Alpine 3.21 | Lightweight, ARM64 only |
| `sandbox-codex-universal` | OpenAI codex-universal | Multi-language support, multi-arch |

## Requirements

Every sandbox image must include:

1. **pi** -- the coding agent CLI, installed at `/usr/local/bin/pi`
2. **fixuid** -- bind mount UID/GID remapping (see below)
3. **An entrypoint** that loads secrets from `/run/secrets/` into env vars
4. **A non-root user** named `user` (UID 1000)

### Pi Installation

Pi can be installed two ways depending on the base image:

- **Via npm** (requires Node.js): install `@mariozechner/pi-coding-agent` globally, then symlink the CLI entry point to `/usr/local/bin/pi`. See `sandbox-alpine-arm64/Dockerfile`.
- **Via binary release** (no Node.js needed): download the platform-specific tarball from GitHub releases. See `sandbox-codex-universal/Dockerfile`.

### fixuid

When the relay server creates a container, it passes `--user <hostUID>:<hostGID>` so that bind-mounted directories (workspace, agent data) are writable. The problem is the container's `user` (UID 1000) no longer matches the runtime UID, which breaks tools like git that check file ownership and `/etc/passwd` for the current user.

[fixuid](https://github.com/boxboat/fixuid) solves this. It runs as the container entrypoint (before the actual entrypoint script) and:

1. Detects the runtime UID/GID the container was launched with
2. Updates `/etc/passwd` and `/etc/group` to remap `user` (1000) to the runtime UID
3. Chowns configured directories (`/home/user`, `/workspace`, `/data/agent`) to match

This means tools inside the container see a real user identity and can write to bind-mounted directories regardless of the host UID.

**Installation (Alpine):**

```dockerfile
RUN curl -SsL https://github.com/boxboat/fixuid/releases/download/v0.6.0/fixuid-0.6.0-linux-arm64.tar.gz | tar -C /usr/local/bin -xzf - && \
    chown root:root /usr/local/bin/fixuid && \
    chmod 4755 /usr/local/bin/fixuid && \
    mkdir -p /etc/fixuid && \
    printf "user: user\ngroup: user\npaths:\n  - /home/user\n  - /workspace\n  - /data/agent\n" > /etc/fixuid/config.yml
```

**Installation (Debian/Ubuntu, multi-arch):**

```dockerfile
ARG TARGETARCH
RUN FIXUID_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") && \
    curl -SsL "https://github.com/boxboat/fixuid/releases/download/v0.6.0/fixuid-0.6.0-linux-${FIXUID_ARCH}.tar.gz" | tar -C /usr/local/bin -xzf - && \
    chown root:root /usr/local/bin/fixuid && \
    chmod 4755 /usr/local/bin/fixuid && \
    mkdir -p /etc/fixuid && \
    printf "user: user\ngroup: user\npaths:\n  - /home/user\n  - /workspace\n  - /data/agent\n" > /etc/fixuid/config.yml
```

The entrypoint must chain through fixuid:

```dockerfile
ENTRYPOINT ["fixuid", "-q", "/entrypoint.sh"]
```

### Entrypoint

The entrypoint script loads secrets from bind-mounted files into environment variables. Secrets are mounted at `/run/secrets/` as individual files by the relay server. The script reads each file, converts the filename to an uppercase env var (e.g., `anthropic_api_key` becomes `ANTHROPIC_API_KEY`), and exports it. See `sandbox-alpine-arm64/entrypoint.sh` for the reference implementation.

### Directory Layout Inside the Container

| Container Path | Purpose | Bind-mounted from host |
|---|---|---|
| `/workspace` | Working directory, repo clone target | `<stateDir>/sessions/<id>/workspace/` |
| `/data/agent` | Pi session files (JSONL) | `<stateDir>/sessions/<id>/agent/` |
| `/run/secrets` | Provider API keys (read-only) | `<stateDir>/pi-secrets-<id>/` |

## Building

```bash
# Alpine ARM64
docker build -t pi-sandbox:alpine dockerfiles/sandbox-alpine-arm64/

# Codex Universal
docker build -t pi-sandbox:local dockerfiles/sandbox-codex-universal/
```

## Adding a New Image

1. Create a new directory under `dockerfiles/` (e.g., `sandbox-my-image/`)
2. Add a `Dockerfile` and `entrypoint.sh`
3. Install pi, fixuid, and a non-root `user` as described above
4. Set `ENTRYPOINT ["fixuid", "-q", "/entrypoint.sh"]`
5. Build and tag, then set `SANDBOX_DOCKER_IMAGE` in the relay server config
