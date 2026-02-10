export type APIResponse<T> =
  | { data: T; error: null }
  | { data: null; error: string };

// Runtime-replaceable relay URL. At build time this is a placeholder string
// that gets sed-replaced by docker-entrypoint.sh at container startup.
// We use a separate variable to prevent the bundler from inlining/optimizing
// the placeholder comparison.
export const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "";
const BASE_URL = `${RELAY_URL}/api`;

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<APIResponse<T>> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    const json = (await response.json()) as APIResponse<T>;
    return json;
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    request<T>(path, {
      method: "DELETE",
    }),
};

// Types for API responses
export interface Session {
  id: string;
  mode: "chat" | "code";
  status: "creating" | "active" | "suspended" | "error" | "deleted";

  // Repo linkage
  // repoId is the repo primary key in our DB (can be owner/name or a numeric GitHub id string)
  repoId?: string;
  // repoFullName is the canonical user/name string (joined from repos table)
  repoFullName?: string | null;

  repoPath?: string;
  branchName?: string;
  name?: string;
  firstUserMessage?: string;
  currentModelProvider?: string;
  currentModelId?: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface GitHubTokenInfo {
  configured: boolean;
  valid?: boolean;
  user?: string;
  scopes?: string[];
  rateLimitRemaining?: number;
  error?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  description?: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
}

export interface JournalEvent {
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface ActivateResponse {
  sessionId: string;
  status: Session["status"];
  lastSeq: number;
  sandboxStatus: string;
  wsEndpoint: string;
}

export interface EventsResponse {
  events: JournalEvent[];
  lastSeq: number;
}

export interface SessionHistoryResponse {
  entries: SessionHistoryEntry[];
}

/**
 * An entry from pi's JSONL session file.
 * Typed loosely — the UI renders based on `type` and known fields,
 * falling back to raw JSON for unknown types.
 */
export interface SessionHistoryEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  [key: string]: unknown;
}

// Environments
export interface Environment {
  id: string;
  name: string;
  sandboxType: "docker" | "cloudflare";
  config: EnvironmentConfig;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentConfig {
  image?: string;
  workerUrl?: string;
  secretId?: string;
  resources?: {
    cpuShares?: number;
    memoryMB?: number;
  };
}

export interface AvailableImage {
  id: string;
  name: string;
  image: string;
  description: string;
}

export interface CreateEnvironmentRequest {
  name: string;
  sandboxType: "docker" | "cloudflare";
  config: EnvironmentConfig;
  isDefault?: boolean;
}

export interface UpdateEnvironmentRequest {
  name?: string;
  config?: EnvironmentConfig;
  isDefault?: boolean;
}

export interface SandboxProviderStatus {
  docker: { available: boolean };
}

export interface ProbeResult {
  available: boolean;
  sandboxType?: string;
  error?: string;
}
