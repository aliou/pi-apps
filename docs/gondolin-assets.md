# Gondolin assets

Gondolin environments need a prebuilt guest asset directory. The relay looks for the standard asset files:

- `manifest.json`
- `vmlinuz-virt`
- `initramfs.cpio.lz4`
- `rootfs.ext4`

If `imagePath` is not set, the relay falls back to its default cache location. If those assets are missing, Gondolin-backed flows fail until assets are installed.

## Source of truth

Pi Apps publishes Gondolin guest assets as GitHub release artifacts from this repository. The release asset currently used by the installer is:

- `gondolin-assets-aarch64-linux.tar.gz`

The installer uses the GitHub Releases API, downloads the selected asset, and verifies the GitHub-provided SHA-256 digest before extracting anything. If the digest is missing or mismatched, installation fails closed.

## Manual install

Run from the repo root:

```bash
pnpm exec tsx server/scripts/install-gondolin-assets.ts \
  --release latest \
  --dest ./.dev/relay/cache/gondolin-custom
```

This creates a versioned directory like:

```text
.dev/relay/cache/gondolin-custom/<release-tag>
```

Point a Gondolin environment at that extracted directory with `config.imagePath`.

## Suggested local path

For local development, keep assets under the relay cache tree:

```text
.dev/relay/cache/gondolin-custom
```

This keeps large build artifacts inside the repo-local dev state instead of scattering them across the machine.

## Notes

- The helper uses `tar` without shell interpolation.
- The helper only installs from published GitHub release artifacts.
- You can still set `imagePath` manually if you already have a verified asset directory.
- A failed install does not block manual path entry in the UI.
