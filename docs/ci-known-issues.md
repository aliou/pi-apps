# CI Known Issues

This document tracks known issues with the CI pipeline and their workarounds.

## Gondolin Assets on ARM Runners (ubuntu-24.04-arm)

### Status

**Last Updated:** 2026-03-11

**Affected:** `relay-gondolin-assets` job for `aarch64` architecture

### Problem

QEMU crashes on GitHub Actions ARM runners when executing Gondolin microVMs. The crash occurs during the smoke check (VM execution), not during the asset build.

**Error Message:**
```
error protocol_error: virtio bridge error: read ECONNRESET
(qemu: ERROR:target/arm/internals.h:767:regime_is_user: code should not be reached)
```

### Root Cause

This is an upstream QEMU bug on GitHub Actions ARM runners. The issue occurs when:
- Running on `ubuntu-24.04-arm` GitHub-hosted runners
- Using Alpine Linux with `linux-virt` kernel (tested with 3.22 and 3.23)
- Executing any VM via QEMU system emulation

The crash happens in QEMU's ARM MMU code (`regime_is_user` assertion failure), suggesting a memory management unit inconsistency during VM execution.

### What Was Tested

| Alpine Version | Kernel Version | Result |
|----------------|----------------|--------|
| 3.23.0 | 6.18.16 | QEMU crash |
| 3.22.0 | 6.12.x | QEMU crash (also hangs) |

Both versions fail, indicating this is not kernel-version specific but likely a QEMU or runner configuration issue.

### Current Workaround

The CI workflow has been modified to:

1. **Build assets without VM execution:** Use `--skip-smoke` flag during asset build
2. **Skip VM-based tests:** Disable probe and integration test steps
3. **Keep artifacts:** Assets are still built, verified, and uploaded

**Workflow changes:**
- `relay-gondolin-assets` job builds assets but skips smoke check
- "Probe Gondolin assets" step disabled with `if: false`
- "Test (Gondolin integration)" step disabled with `if: false`

### What Still Works

- Asset compilation (Zig build)
- Rootfs image creation
- Kernel fetching
- Asset verification (manifest validation)
- Artifact upload to GitHub

### Workarounds for Testing

If you need to test Gondolin assets:

1. **Download CI artifacts:**
   ```bash
   gh run download <run-id> -n gondolin-assets-aarch64-<sha>
   ```

2. **Test locally on ARM64 machine:**
   ```bash
   export GONDOLIN_GUEST_DIR=/path/to/downloaded/assets
   gondolin exec -- /bin/bash -lc "pi --version"
   ```

3. **Use Lima VM on macOS:**
   - The Lima VM (`pi-apps`) can run Gondolin locally
   - See `.agents/skills/pi-apps-lima-vm.md` for setup

### Future Options

1. **Cross-emulation on x86_64:** Use x86_64 runners with `qemu-system-aarch64` (TCG mode)
   - Slower but avoids ARM runner bug
   - Would require workflow modifications

2. **Self-hosted ARM runner:** Run tests on own ARM hardware with working QEMU

3. **Wait for upstream fix:** GitHub or QEMU may fix this issue

4. **Alternative kernel:** Test non-virt kernel or different distribution

### References

- Gondolin build config: `server/sandboxes/gondolin/custom-assets.build-config.json`
- CI workflow: `.github/workflows/ci.yml`
- Setup script: `server/sandboxes/gondolin/scripts/setup-custom-assets.sh`
