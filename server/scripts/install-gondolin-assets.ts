#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { mkdir, open, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { hasAssets } from "../relay/src/sandbox/gondolin/paths";

type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  digest: string | null;
  browser_download_url: string;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

const DEFAULT_REPO = "aliou/pi-apps";
const DEFAULT_ASSET_NAME = "gondolin-assets-aarch64-linux.tar.gz";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dest = resolve(args.dest);
  const release = await fetchRelease(args.repo, args.release);
  const asset = release.assets.find((item) => item.name === args.assetName);

  if (!asset) {
    throw new Error(
      `Release ${release.tag_name} does not contain asset ${args.assetName}`,
    );
  }

  const digest = parseSha256Digest(asset.digest);
  if (!digest) {
    throw new Error(
      `Release asset ${asset.name} is missing a sha256 digest; refusing install`,
    );
  }

  const stagingRoot = mkdtempSync(join(tmpdir(), "pi-gondolin-assets-"));
  const archivePath = join(stagingRoot, asset.name);
  const extractDir = join(stagingRoot, "extract");
  const finalDir = join(dest, release.tag_name);
  const tempInstallDir = `${finalDir}.tmp`;

  try {
    await mkdir(dest, { recursive: true });
    await downloadAsset(asset.browser_download_url, archivePath);
    const actualDigest = await sha256File(archivePath);
    if (actualDigest !== digest) {
      throw new Error(
        `Checksum mismatch for ${asset.name}: expected ${digest}, got ${actualDigest}`,
      );
    }

    await mkdir(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);

    const extractedAssetDir = await resolveExtractedAssetDir(extractDir);
    if (!hasAssets(extractedAssetDir)) {
      throw new Error(
        `Archive ${asset.name} did not contain a valid Gondolin asset directory`,
      );
    }

    rmSync(tempInstallDir, { recursive: true, force: true });
    await rename(extractedAssetDir, tempInstallDir);
    rmSync(finalDir, { recursive: true, force: true });
    await rename(tempInstallDir, finalDir);

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          repo: args.repo,
          release: release.tag_name,
          releaseUrl: release.html_url,
          asset: asset.name,
          digest,
          destination: finalDir,
          manifest: join(finalDir, "manifest.json"),
          size: asset.size,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(tempInstallDir, { recursive: true, force: true });
  }
}

function parseArgs(argv: string[]) {
  let release = "latest";
  let dest: string | null = null;
  let repo = DEFAULT_REPO;
  let assetName = DEFAULT_ASSET_NAME;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--release") {
      release = argv[++index] ?? release;
      continue;
    }
    if (value === "--dest") {
      dest = argv[++index] ?? null;
      continue;
    }
    if (value === "--repo") {
      repo = argv[++index] ?? repo;
      continue;
    }
    if (value === "--asset") {
      assetName = argv[++index] ?? assetName;
      continue;
    }
    if (value === "--help") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  if (!dest) {
    throw new Error("Missing required --dest <directory> argument");
  }

  return { release, dest, repo, assetName };
}

function printHelp() {
  process.stdout.write(
    "Install Gondolin guest assets from a GitHub release.\n\n",
  );
  process.stdout.write(
    "Usage: pnpm exec tsx server/scripts/install-gondolin-assets.ts --release latest --dest <directory>\n\n",
  );
  process.stdout.write("Options:\n");
  process.stdout.write(
    `  --release <tag|latest>   Release tag to install. Default: latest\n`,
  );
  process.stdout.write(
    "  --dest <directory>       Parent directory for versioned assets\n",
  );
  process.stdout.write(
    `  --repo <owner/name>      GitHub repo. Default: ${DEFAULT_REPO}\n`,
  );
  process.stdout.write(
    `  --asset <filename>       Release asset name. Default: ${DEFAULT_ASSET_NAME}\n`,
  );
}

async function fetchRelease(
  repo: string,
  release: string,
): Promise<GitHubRelease> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid repo ${repo}; expected owner/name`);
  }

  const path =
    release === "latest"
      ? `/repos/${owner}/${name}/releases/latest`
      : `/repos/${owner}/${name}/releases/tags/${encodeURIComponent(release)}`;

  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubJsonHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch release metadata (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as GitHubRelease;
}

function githubJsonHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "pi-relay-gondolin-installer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function parseSha256Digest(digest: string | null): string | null {
  if (!digest) return null;
  const [algorithm, value] = digest.split(":", 2);
  if (algorithm !== "sha256" || !value) return null;
  return value;
}

async function downloadAsset(url: string, destination: string) {
  const response = await fetch(url, {
    headers: githubJsonHeaders(),
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download asset (${response.status} ${response.statusText})`,
    );
  }

  await pipeline(response.body, createWriteStream(destination));
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function extractArchive(archivePath: string, extractDir: string) {
  await runChild("tar", ["-xzf", archivePath, "-C", extractDir]);
}

async function resolveExtractedAssetDir(extractDir: string): Promise<string> {
  if (hasAssets(extractDir)) {
    return extractDir;
  }

  const entries = await readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(extractDir, entry.name);
    if (hasAssets(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No Gondolin asset directory found in ${extractDir}`);
}

async function runChild(command: string, args: string[]) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

const entrypoint = process.argv[1]
  ? resolve(process.argv[1])
  : fileURLToPath(import.meta.url);
if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
