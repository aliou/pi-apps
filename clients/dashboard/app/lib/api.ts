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
    const defaultHeaders: HeadersInit = {};
    const body = options?.body;

    if (!(body instanceof FormData) && !(body instanceof Blob)) {
      defaultHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        ...defaultHeaders,
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

  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: "POST",
      body: formData,
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

const CLIENT_ID_KEY = "pi-dashboard-client-id";

/**
 * Get or generate a persistent client ID for this browser.
 * Stored in localStorage and reused across sessions.
 */
export function getClientId(): string {
  if (typeof window === "undefined") {
    // SSR fallback - generate temporary ID
    return crypto.randomUUID();
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/**
 * Set client capabilities for a session.
 * Must be called after activate to register this client for extension UI handling.
 */
export async function setClientCapabilities(
  sessionId: string,
  clientId: string,
  capabilities: { extensionUI: boolean },
): Promise<APIResponse<ClientCapabilitiesResponse>> {
  return api.put<ClientCapabilitiesResponse>(
    `/sessions/${sessionId}/clients/${clientId}/capabilities`,
    {
      clientKind: "web",
      capabilities,
    },
  );
}

// Types for API responses
export interface Session {
  id: string;
  mode: "chat" | "code";
  status: "creating" | "active" | "idle" | "archived" | "error";

  // Repo linkage
  // repoId is the repo primary key in our DB (can be owner/name or a numeric GitHub id string)
  repoId?: string;
  // repoFullName is the canonical user/name string (joined from repos table)
  repoFullName?: string | null;

  repoPath?: string;
  branchName?: string;
  branchCreationDeferred?: boolean;
  environmentId?: string;
  name?: string;
  firstUserMessage?: string;
  currentModelProvider?: string;
  currentModelId?: string;
  extensionsStale?: boolean;
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

export interface ModelInfo {
  id: string;
  provider: string;
  name?: string;
  contextWindow?: number;
  maxOutput?: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
  source:
    | "configured-environment"
    | "fallback-environment"
    | "fallback-cache"
    | "fallback-static";
  environmentId?: string;
  degraded?: boolean;
  message?: string;
}

export interface ModelsIntrospectionSetting {
  environmentId?: string;
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

export interface ClientCapabilitiesRequest {
  clientKind?: "web" | "ios" | "macos" | "unknown";
  capabilities: {
    extensionUI: boolean;
  };
}

export interface ClientCapabilitiesResponse {
  sessionId: string;
  clientId: string;
  capabilities: {
    extensionUI: boolean;
  };
}

export interface EventsResponse {
  events: JournalEvent[];
  lastSeq: number;
}

export interface SessionHistoryResponse {
  entries: SessionHistoryEntry[];
}

export interface SessionFileRecord {
  id: string;
  sessionId: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  localPath: string;
  sandboxPath?: string;
  writeDeferred?: boolean;
}

export interface SessionFilesResponse {
  files: SessionFileRecord[];
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
  sandboxType: "docker" | "cloudflare" | "gondolin";
  config: EnvironmentConfig;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentConfig {
  image?: string;
  workerUrl?: string;
  secretId?: string;
  imagePath?: string;
  idleTimeoutSeconds?: number;
  envVars?: Array<{ key: string; value: string }>;
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
  sandboxType: "docker" | "cloudflare" | "gondolin";
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
  gondolin: { available: boolean };
}

export interface ProbeResult {
  available: boolean;
  sandboxType?: string;
  error?: string;
}

export interface GondolinMetadata {
  defaultInstallBaseDir: string;
  checkedPath: string;
  assetsExist: boolean;
  installCommand: string;
  installedAssetDirs: string[];
}

export interface GondolinInstallResponse {
  ok: boolean;
  destination: string;
  output?: string;
}

// Sandbox
export interface SandboxStatusResponse {
  sessionId: string;
  provider: string | null;
  providerId: string | null;
  status: string; // "running" | "stopped" | "creating" | "error" etc
  capabilities: {
    exec: boolean;
    restart: boolean;
    terminal: boolean;
  } | null;
}

export interface SandboxRestartResponse {
  ok: boolean;
  sandboxStatus: string;
}

export interface SandboxExecResponse {
  exitCode: number;
  output: string;
}

// Extension configs
export type ExtensionScope = "global" | "chat" | "code" | "session";

export interface ExtensionManifestFieldSchema {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

export interface ExtensionManifest {
  name: string;
  version: string;
  description?: string;
  keywords: string[];
  homepage?: string;
  repository?: string;
  tools: string[];
  providers: string[];
  skills: string[];
  fetchedAt: string;
  schema?: {
    type?: string;
    properties?: Record<string, ExtensionManifestFieldSchema>;
    required?: string[];
  };
}

export interface ExtensionConfig {
  id: string;
  scope: ExtensionScope;
  sessionId: string | null;
  package: string;
  configJson?: string | null;
  createdAt: string;
}

export interface ExtensionConfigRecord extends ExtensionConfig {
  manifest?: ExtensionManifest | null;
}

export interface CatalogPackage {
  name: string;
  version: string;
  description?: string;
  keywords: string[];
  homepage?: string;
  repository?: string;
  extensionMeta?: {
    tools?: string[];
    providers?: string[];
    skills?: string[];
  };
}

export interface PackageCatalogResponse {
  packages: CatalogPackage[];
  fetchedAt: string | null;
  stale: boolean;
}
