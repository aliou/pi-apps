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
  define: {
    // Bake build identity in at build time. Falls back to dev markers locally.
    "process.env.GIT_COMMIT": JSON.stringify(process.env.GIT_COMMIT ?? "dev"),
    "process.env.DASHBOARD_GIT_COMMIT": JSON.stringify(
      process.env.DASHBOARD_GIT_COMMIT ?? process.env.PI_DASHBOARD_COMMIT ?? "dev",
    ),
    "process.env.BUILT_AT": JSON.stringify(
      process.env.BUILT_AT ?? new Date().toISOString(),
    ),
    "process.env.RELAY_VERSION": JSON.stringify(process.env.RELAY_VERSION ?? "0.1.0"),
  },
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
