# Host-side fuzzing

This directory contains lightweight, deterministic fuzzers for the TypeScript host.

These fuzzers are meant to cover **host-side parsers/state machines that consume untrusted guest input**
(e.g. virtio framing, ethernet/IP/TCP parsing, DNS query parsing, tar parsing).

## Run

From the repo root:

```bash
make fuzz-host                           # default target (virtio), runs forever
make fuzz-host HOST_FUZZ_TARGET=dns      # a single target, runs forever
```

Or directly:

```bash
cd host
pnpm run fuzz -- dns
pnpm run fuzz -- virtio
pnpm run fuzz -- net

# bounded run
pnpm run fuzz -- virtio --iters 50000
```

## Repro

When a fuzzer crashes it writes an artifact to:

```
host/fuzz/artifacts/<target>/...
```

You can replay it:

```bash
cd host
pnpm run fuzz -- <target> --repro ./fuzz/artifacts/<target>/<file>.bin
```

## Tuning

- `--iters N` number of iterations (default: runs forever; `--iters 0` also runs forever)
- `--seed N` deterministic RNG seed (default: 1)
- `--max-len N` max input length (default: target-specific)

For longer runs, just omit `--iters` (default) or set a higher iteration count.
