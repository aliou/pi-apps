import { existsSync, mkdirSync } from "node:fs";
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
  // Externalize native deps and packages with CJS __dirname usage
  external: [
    "@earendil-works/gondolin",
    "better-sqlite3",
    "cpu-features",
    "dockerode",
    "ssh2",
  ],
  // Banner to provide require() for CJS dependencies
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

console.log("Build complete: dist/index.js");
