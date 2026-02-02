# Sandbox Docker Images

Docker images that run pi inside containers for the relay server's sandboxed sessions.

## Key Constraints

Every sandbox image **must** have:

1. **pi CLI** at `/usr/local/bin/pi` -- either via npm or binary release
2. **fixuid** at `/usr/local/bin/fixuid` with setuid bit (chmod 4755) and config at `/etc/fixuid/config.yml` mapping `user:user` with paths `/home/user`, `/workspace`, `/data/agent`
3. **Non-root user** named `user` (UID 1000, created via `adduser` or `useradd`)
4. **Entrypoint** chained through fixuid: `ENTRYPOINT ["fixuid", "-q", "/entrypoint.sh"]`
5. **entrypoint.sh** that loads secrets from `/run/secrets/` into env vars

Without fixuid, bind-mounted directories will have permission errors when the host UID differs from the container's UID 1000 (common on macOS with Lima/Colima).

## When Modifying Images

- Keep fixuid installation after user creation and before `USER user`
- Keep entrypoint.sh compatible with the secrets loading pattern (read files from `$PI_SECRETS_DIR`, export as uppercase env vars)
- Test with `docker run --rm -u $(id -u):$(id -g) -v /tmp/test:/workspace <image> bash -c "whoami && touch /workspace/test"` to verify permissions work

## When Adding a New Image

Copy the fixuid installation block and entrypoint pattern from an existing image. See `README.md` for the full checklist.
