import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function hasAssets(dir: string): boolean {
  return ["manifest.json", "vmlinuz-virt", "initramfs.cpio.lz4", "rootfs.ext4"]
    .map((name) => join(dir, name))
    .every((path) => existsSync(path));
}

export function ensureAgentDirs(agentDir: string): void {
  mkdirSync(join(agentDir, "data"), { recursive: true });
  mkdirSync(join(agentDir, "config"), { recursive: true });
  mkdirSync(join(agentDir, "cache"), { recursive: true });
  mkdirSync(join(agentDir, "state"), { recursive: true });
}

export function getSessionPaths(sessionDir: string): {
  workspaceDir: string;
  agentDir: string;
  gitDir: string;
} {
  return {
    workspaceDir: join(sessionDir, "workspace"),
    agentDir: join(sessionDir, "agent"),
    gitDir: join(sessionDir, "git"),
  };
}
