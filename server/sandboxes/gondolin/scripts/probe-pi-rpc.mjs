#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("server_shutdown")) {
    console.error(`[warn] ignored uncaughtException: ${msg}`);
    return;
  }
  throw err;
});

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../../../..");

const cacheRoot = join(projectRoot, ".dev", "relay", "cache");
const docker2vmDir = join(cacheRoot, "docker2vm-src");
const imageOut = process.env.GONDOLIN_IMAGE_OUT
  ? resolve(process.env.GONDOLIN_IMAGE_OUT)
  : join(cacheRoot, "gondolin-custom", "pi-runtime-docker2vm");
const sourceImage = process.env.GONDOLIN_SOURCE_IMAGE ?? "ghcr.io/aliou/pi-sandbox-alpine-arm64:latest";
const rpcTimeoutMs = Number.parseInt(process.env.GONDOLIN_RPC_TIMEOUT_MS ?? "45000", 10);
const piProbeTimeoutMs = Number.parseInt(process.env.GONDOLIN_PI_PROBE_TIMEOUT_MS ?? "60000", 10);
const gondolinAccel = process.env.GONDOLIN_ACCEL;

const require = createRequire(import.meta.url);
const gondolinEntry = require.resolve("@earendil-works/gondolin", {
  paths: [resolve(projectRoot, "server/relay")],
});
const { VM } = await import(gondolinEntry);

function log(step, msg) {
  console.error(`[${new Date().toISOString()}] [${step}] ${msg}`);
}

function run(cmd, args, cwd = process.cwd()) {
  return new Promise((resolvePromise, rejectPromise) => {
    log("run", `${cmd} ${args.join(" ")} (cwd=${cwd})`);
    const p = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    p.on("error", rejectPromise);
    p.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`command failed (${code}): ${cmd} ${args.join(" ")}`));
    });
  });
}

function hasAssets(dir) {
  return ["manifest.json", "vmlinuz-virt", "initramfs.cpio.lz4", "rootfs.ext4"].every((f) =>
    existsSync(join(dir, f)),
  );
}

async function ensureAssets() {
  if (hasAssets(imageOut)) {
    log("assets", `using existing assets at ${imageOut}`);
    return;
  }

  mkdirSync(cacheRoot, { recursive: true });
  mkdirSync(imageOut, { recursive: true });

  if (!existsSync(docker2vmDir)) {
    await run("git", [
      "clone",
      "--depth",
      "1",
      "https://github.com/vmg-dev/docker2vm.git",
      docker2vmDir,
    ]);
  }

  await run("bun", ["install"], docker2vmDir);
  await run(
    "bun",
    [
      "run",
      "oci2gondolin",
      "--",
      "--image",
      sourceImage,
      "--platform",
      "linux/arm64",
      "--mode",
      "assets",
      "--out",
      imageOut,
    ],
    docker2vmDir,
  );

  if (!hasAssets(imageOut)) {
    throw new Error(`asset conversion completed but files missing in ${imageOut}`);
  }
}

async function main() {
  await ensureAssets();

  const sessionName = `gondolin-rpc-probe-${Date.now()}`;
  let vm = null;
  let proc = null;

  try {
    log("vm", `creating VM from ${imageOut}`);
    vm = await VM.create({
      sandbox: {
        imagePath: imageOut,
        ...(gondolinAccel ? { accel: gondolinAccel } : {}),
      },
      env: {
        // no LLM call in this probe, key is only to keep model list non-empty
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "test-key",
      },
    });

    const version = await vm.exec("pi --version", {
      signal: AbortSignal.timeout(piProbeTimeoutMs),
    });
    if (version.exitCode !== 0) {
      throw new Error(`pi --version failed: ${version.stderr || version.stdout}`);
    }

    proc = vm.exec("pi --mode rpc", { stdin: true, buffer: false });
    const stdoutRl = readline.createInterface({ input: proc.stdout });
    const stderrRl = readline.createInterface({ input: proc.stderr });

    const responses = new Map();
    let fatalError = "";

    stdoutRl.on("line", (line) => {
      log("rpc:stdout", line);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg?.type === "response" && msg?.id) {
        responses.set(msg.id, msg);
      }
      if (msg?.type === "error") {
        fatalError = JSON.stringify(msg);
      }
    });

    stderrRl.on("line", (line) => {
      log("rpc:stderr", line);
    });

    const send = (payload) => {
      proc.write(`${JSON.stringify(payload)}\n`);
    };

    const waitResponse = async (id) => {
      const start = Date.now();
      while (true) {
        if (fatalError) throw new Error(fatalError);
        const r = responses.get(id);
        if (r) return r;
        if (Date.now() - start > rpcTimeoutMs) {
          throw new Error(`timeout waiting response id=${id}`);
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    send({ type: "get_state", id: "s1" });
    const s1 = await waitResponse("s1");
    if (!s1.success) throw new Error(`get_state s1 failed: ${JSON.stringify(s1)}`);

    send({ type: "set_session_name", id: "n1", name: sessionName });
    const n1 = await waitResponse("n1");
    if (!n1.success) throw new Error(`set_session_name failed: ${JSON.stringify(n1)}`);

    send({ type: "get_state", id: "s2" });
    const s2 = await waitResponse("s2");
    if (!s2.success) throw new Error(`get_state s2 failed: ${JSON.stringify(s2)}`);

    const applied = s2?.data?.sessionName === sessionName;
    if (!applied) {
      throw new Error(
        `session name not applied, expected=${sessionName} got=${JSON.stringify(s2?.data?.sessionName)}`,
      );
    }

    try {
      proc.end();
    } catch {}
    stdoutRl.close();
    stderrRl.close();

    console.log(
      JSON.stringify(
        {
          ok: true,
          imageOut,
          sourceImage,
          sessionName,
          initialState: {
            sessionId: s1?.data?.sessionId,
            sessionName: s1?.data?.sessionName ?? null,
          },
          finalState: {
            sessionId: s2?.data?.sessionId,
            sessionName: s2?.data?.sessionName ?? null,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (proc) {
      try {
        proc.end();
      } catch {}
    }
    if (vm) {
      await vm.close().catch((err) => log("vm", `close error: ${String(err)}`));
    }
  }
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
