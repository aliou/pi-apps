import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure dist directory exists
const distDir = join(__dirname, "dist");
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Build the server
await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.js",
  sourcemap: true,
  // Externalize pi-coding-agent (has native deps) and other node builtins
  external: ["@mariozechner/pi-coding-agent"],
  // Banner to handle __dirname in ESM
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim(),
  },
});

// Copy pi-coding-agent package.json to dist (needed for version detection)
const piPkgSrc = join(__dirname, "node_modules/@mariozechner/pi-coding-agent/package.json");
if (existsSync(piPkgSrc)) {
  cpSync(piPkgSrc, join(distDir, "pi-package.json"));
}

console.log("Build complete: dist/index.js");
