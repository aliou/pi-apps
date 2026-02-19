import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { createLogger } from "../lib/logger";

const logger = createLogger("extension-installer");

/**
 * Pre-installs extensions on the host filesystem so they can be bind-mounted
 * into gondolin VMs. Clones git repos and runs `npm install` on the host so
 * the VM can reference them as local directory paths, bypassing `pi install`.
 *
 * @param agentDir         - Host path to the session's agent directory
 *                           (e.g. `.dev/relay/state/sessions/<id>/agent`)
 * @param packages         - Package sources from extension configs
 *                           (e.g. `["git:https://github.com/aliou/pi-linkup.git"]`)
 * @param guestExtensionsDir - Path prefix as seen from inside the VM
 *                           (e.g. `/agent/extensions`)
 * @returns Array of local extension paths as seen from the guest
 *          (e.g. `["/agent/extensions/pi-linkup"]`)
 */
export async function preInstallExtensions(
  agentDir: string,
  packages: string[],
  guestExtensionsDir: string,
): Promise<string[]> {
  const guestPaths: string[] = [];

  for (const pkg of packages) {
    if (pkg.startsWith("npm:")) {
      logger.warn(
        { package: pkg },
        "npm packages are not supported for pre-install; skipping",
      );
      continue;
    }

    if (!pkg.startsWith("git:")) {
      logger.warn(
        { package: pkg },
        "unknown package prefix; skipping (only git: is supported for pre-install)",
      );
      continue;
    }

    const gitUrl = pkg.slice("git:".length);

    // Derive a directory name from the last path segment of the URL, stripping
    // any trailing `.git` extension (e.g. "https://github.com/aliou/pi-linkup.git"
    // → "pi-linkup").
    const repoName = path
      .basename(new URL(gitUrl).pathname)
      .replace(/\.git$/, "");

    const hostExtensionsDir = path.join(agentDir, "extensions");
    const hostExtensionDir = path.join(hostExtensionsDir, repoName);
    const packageJsonPath = path.join(hostExtensionDir, "package.json");

    try {
      // Ensure the parent extensions directory exists.
      fs.mkdirSync(hostExtensionsDir, { recursive: true });

      if (fs.existsSync(packageJsonPath)) {
        logger.debug(
          { repoName, hostExtensionDir },
          "extension already installed; skipping clone",
        );
      } else {
        logger.debug(
          { repoName, gitUrl, hostExtensionDir },
          "cloning extension",
        );
        execSync(`git clone --depth 1 ${gitUrl} ${hostExtensionDir}`, {
          stdio: "pipe",
        });
        logger.debug({ repoName }, "git clone complete");

        logger.debug({ repoName, hostExtensionDir }, "running npm install");
        execSync("npm install --omit=peer", {
          cwd: hostExtensionDir,
          stdio: "pipe",
        });
        logger.debug({ repoName }, "npm install complete");
      }

      const guestPath = `${guestExtensionsDir}/${repoName}`;
      guestPaths.push(guestPath);
      logger.debug(
        { repoName, guestPath },
        "extension pre-installed successfully",
      );
    } catch (err) {
      logger.error(
        { package: pkg, repoName, hostExtensionDir, err },
        "failed to pre-install extension; skipping",
      );
    }
  }

  return guestPaths;
}
