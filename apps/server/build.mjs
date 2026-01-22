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
  // Externalize pi-coding-agent (has native deps)
  external: ["@mariozechner/pi-coding-agent"],
  // Banner to provide require() for CJS dependencies (ws, etc.)
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

// Copy pi-coding-agent package.json to dist (needed for version detection)
const piPkgSrc = join(__dirname, "node_modules/@mariozechner/pi-coding-agent/package.json");
if (existsSync(piPkgSrc)) {
  cpSync(piPkgSrc, join(distDir, "pi-package.json"));
}

console.log("Build complete: dist/index.js");
