import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Parsed entry from a pi session JSONL file.
 * We intentionally use loose types here — the dashboard renders
 * based on `type` and known fields, falling back to raw JSON
 * for unknown entry types.
 */
export interface SessionEntry {
  type: string;
  [key: string]: unknown;
}

/**
 * Parse JSONL content into an array of entries.
 * Skips blank lines and malformed JSON gracefully.
 *
 * Ported from pi-coding-agent's parseSessionEntries (pure function, no deps).
 */
export function parseSessionEntries(content: string): SessionEntry[] {
  const entries: SessionEntry[] = [];
  const lines = content.trim().split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as SessionEntry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Find and read the most recent JSONL session file from a session's agent directory.
 *
 * Pi organizes session files by CWD. Since the container's CWD is /workspace,
 * session files are stored under:
 *   <agentDir>/sessions/--workspace--/<timestamp>_<uuid>.jsonl
 *
 * Returns parsed entries, or null if no session file exists.
 */
export function readSessionHistory(agentDir: string): SessionEntry[] | null {
  const sessionsBase = join(agentDir, "sessions");
  if (!existsSync(sessionsBase)) return null;

  // Find the session subdirectory (typically --workspace--)
  // Scan all subdirectories in case the CWD encoding differs
  const subdirs = readdirSync(sessionsBase, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(sessionsBase, d.name));

  if (subdirs.length === 0) return null;

  // Collect all .jsonl files across all subdirs
  const jsonlFiles: { path: string; mtime: number }[] = [];
  for (const subdir of subdirs) {
    const files = readdirSync(subdir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const fullPath = join(subdir, file);
      const stat = statSync(fullPath);
      jsonlFiles.push({ path: fullPath, mtime: stat.mtimeMs });
    }
  }

  if (jsonlFiles.length === 0) return null;

  // Sort oldest-first so entries are in chronological order across sessions.
  jsonlFiles.sort((a, b) => a.mtime - b.mtime);

  const allEntries: SessionEntry[] = [];
  for (const file of jsonlFiles) {
    const content = readFileSync(file.path, "utf-8");
    allEntries.push(...parseSessionEntries(content));
  }

  return allEntries.length > 0 ? allEntries : null;
}
