import { createPrivateKey, createSign } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import { settings } from "../db/schema";
import type { SecretsService } from "./secrets.service";

const API_BASE = "https://api.github.com";

export const GITHUB_APP_CONFIG_KEY = "github_app_config";
export const GITHUB_APP_PRIVATE_KEY_SECRET = "GITHUB_APP_PRIVATE_KEY";
export const GITHUB_APP_WEBHOOK_SECRET_SECRET = "GITHUB_APP_WEBHOOK_SECRET";

export interface GitHubAppConfig {
  appId: number;
  installationIds?: number[];
}

export interface GitHubAppStatus {
  configured: boolean;
  appId?: number;
  appName?: string;
  appSlug?: string;
  hasPrivateKey: boolean;
  hasWebhookSecret: boolean;
  installationIds: number[];
  error?: string;
}

export interface GitHubAppConnectRequest {
  appId: number;
  privateKey: string;
  webhookSecret?: string;
  installationIds?: number[];
}

export interface GitHubAppInstallation {
  id: number;
  account: {
    login: string;
    type: "User" | "Organization";
  };
  repositorySelection: "all" | "selected";
  accessTokensUrl: string;
  repositoriesUrl: string;
  suspendedAt: string | null;
}

export interface GitHubAppInstallationToken {
  token: string;
  expiresAt: string;
}

interface GitHubAppMetadata {
  name?: string;
  slug?: string;
}

export class GitHubAppService {
  constructor(
    private db: AppDatabase,
    private secretsService: SecretsService,
  ) {}

  async connect(request: GitHubAppConnectRequest): Promise<void> {
    this.validatePrivateKey(request.privateKey);

    const installationIds = normalizeInstallationIds(request.installationIds);
    await this.upsertConfig({
      appId: request.appId,
      ...(installationIds.length > 0 ? { installationIds } : {}),
    });

    await this.secretsService.setValueByEnvVar(
      GITHUB_APP_PRIVATE_KEY_SECRET,
      request.privateKey.trim(),
    );

    if (request.webhookSecret?.trim()) {
      await this.secretsService.setValueByEnvVar(
        GITHUB_APP_WEBHOOK_SECRET_SECRET,
        request.webhookSecret.trim(),
      );
    } else {
      await this.secretsService.deleteValueByEnvVar(
        GITHUB_APP_WEBHOOK_SECRET_SECRET,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.db
      .delete(settings)
      .where(eq(settings.key, GITHUB_APP_CONFIG_KEY))
      .run();
    await this.secretsService.deleteValueByEnvVar(
      GITHUB_APP_PRIVATE_KEY_SECRET,
    );
    await this.secretsService.deleteValueByEnvVar(
      GITHUB_APP_WEBHOOK_SECRET_SECRET,
    );
  }

  getConfig(): GitHubAppConfig | null {
    const row = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, GITHUB_APP_CONFIG_KEY))
      .get();

    if (!row) return null;

    try {
      const parsed = JSON.parse(row.value) as GitHubAppConfig;
      if (!Number.isInteger(parsed.appId) || parsed.appId <= 0) {
        return null;
      }
      return {
        appId: parsed.appId,
        ...(parsed.installationIds && parsed.installationIds.length > 0
          ? {
              installationIds: normalizeInstallationIds(parsed.installationIds),
            }
          : {}),
      };
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<GitHubAppStatus> {
    const config = this.getConfig();
    const [privateKey, webhookSecret] = await Promise.all([
      this.secretsService.getValueByEnvVar(GITHUB_APP_PRIVATE_KEY_SECRET),
      this.secretsService.getValueByEnvVar(GITHUB_APP_WEBHOOK_SECRET_SECRET),
    ]);

    const hasPrivateKey = Boolean(privateKey);
    const hasWebhookSecret = Boolean(webhookSecret);
    const configured = Boolean(config && hasPrivateKey);

    let metadata: GitHubAppMetadata | null = null;
    let error: string | undefined;

    if (configured && config && privateKey) {
      try {
        metadata = await this.getAppMetadata(config.appId, privateKey);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      configured,
      appId: config?.appId,
      appName: metadata?.name,
      appSlug: metadata?.slug,
      hasPrivateKey,
      hasWebhookSecret,
      installationIds: config?.installationIds ?? [],
      ...(error ? { error } : {}),
    };
  }

  async listInstallations(): Promise<GitHubAppInstallation[]> {
    const { appId, privateKey, installationIds } =
      await this.getConfiguredAuth();
    const jwt = this.generateJWT(appId, privateKey);

    const response = await fetch(`${API_BASE}/app/installations`, {
      headers: this.appHeaders(jwt),
    });

    if (!response.ok) {
      throw await buildGitHubError(response);
    }

    const payload = (await response.json()) as Array<{
      id: number;
      account: { login: string; type: "User" | "Organization" };
      repository_selection: "all" | "selected";
      access_tokens_url: string;
      repositories_url: string;
      suspended_at: string | null;
    }>;

    const all = payload.map((installation) => ({
      id: installation.id,
      account: installation.account,
      repositorySelection: installation.repository_selection,
      accessTokensUrl: installation.access_tokens_url,
      repositoriesUrl: installation.repositories_url,
      suspendedAt: installation.suspended_at,
    }));

    if (installationIds.length === 0) {
      return all;
    }

    return all.filter((installation) =>
      installationIds.includes(installation.id),
    );
  }

  async getRepoInstallationId(repoFullName: string): Promise<number | null> {
    const { appId, privateKey, installationIds } =
      await this.getConfiguredAuth();
    const jwt = this.generateJWT(appId, privateKey);

    const response = await fetch(
      `${API_BASE}/repos/${repoFullName}/installation`,
      {
        headers: this.appHeaders(jwt),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await buildGitHubError(response);
    }

    const payload = (await response.json()) as { id: number };
    if (installationIds.length > 0 && !installationIds.includes(payload.id)) {
      return null;
    }

    return payload.id;
  }

  async getRepoAccessToken(repoFullName: string): Promise<{
    installationId: number;
    token: string;
    expiresAt: string;
  }> {
    const installationId = await this.getRepoInstallationId(repoFullName);

    if (!installationId) {
      throw new Error(
        `GitHub App is not installed for ${repoFullName}. Open GitHub setup and install the app for this repository.`,
      );
    }

    const token = await this.getInstallationTokenForId(installationId);
    return {
      installationId,
      token: token.token,
      expiresAt: token.expiresAt,
    };
  }

  async getInstallationTokenForId(
    installationId: number,
  ): Promise<GitHubAppInstallationToken> {
    const { appId, privateKey } = await this.getConfiguredAuth();
    return this.getInstallationToken(appId, privateKey, installationId);
  }

  async getInstallationToken(
    appId: number,
    privateKey: string,
    installationId: number,
  ): Promise<GitHubAppInstallationToken> {
    const jwt = this.generateJWT(appId, privateKey);

    const response = await fetch(
      `${API_BASE}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: this.appHeaders(jwt),
      },
    );

    if (!response.ok) {
      throw await buildGitHubError(response);
    }

    const payload = (await response.json()) as {
      token: string;
      expires_at: string;
    };

    return {
      token: payload.token,
      expiresAt: payload.expires_at,
    };
  }

  async getActorIdentity(): Promise<{ name: string; email: string }> {
    const status = await this.getStatus();
    const slug = status.appSlug ?? "github-app";
    return {
      name: `${slug}[bot]`,
      email: `${slug}[bot]@users.noreply.github.com`,
    };
  }

  generateJWT(
    appId: number,
    privateKey: string,
    expiresInSeconds = 600,
  ): string {
    if (expiresInSeconds <= 0 || expiresInSeconds > 600) {
      throw new Error(
        "GitHub App JWT expiry must be between 1 and 600 seconds",
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: String(appId),
        iat: now - 60,
        exp: now + expiresInSeconds,
      }),
    ).toString("base64url");
    const data = `${header}.${payload}`;

    const signer = createSign("RSA-SHA256");
    signer.update(data);
    signer.end();

    const signature = signer
      .sign(createPrivateKey(privateKey))
      .toString("base64url");
    return `${data}.${signature}`;
  }

  private async getConfiguredAuth(): Promise<{
    appId: number;
    privateKey: string;
    installationIds: number[];
  }> {
    const config = this.getConfig();
    if (!config) {
      throw new Error(
        "GitHub App not configured. Open GitHub setup and connect the app first.",
      );
    }

    const privateKey = await this.secretsService.getValueByEnvVar(
      GITHUB_APP_PRIVATE_KEY_SECRET,
    );
    if (!privateKey) {
      throw new Error(
        "GitHub App private key is missing. Reconnect the app in GitHub setup.",
      );
    }

    return {
      appId: config.appId,
      privateKey,
      installationIds: config.installationIds ?? [],
    };
  }

  private async getAppMetadata(
    appId: number,
    privateKey: string,
  ): Promise<GitHubAppMetadata> {
    const jwt = this.generateJWT(appId, privateKey);
    const response = await fetch(`${API_BASE}/app`, {
      headers: this.appHeaders(jwt),
    });

    if (!response.ok) {
      throw await buildGitHubError(response);
    }

    const payload = (await response.json()) as {
      name?: string;
      slug?: string;
    };

    return {
      name: payload.name,
      slug: payload.slug,
    };
  }

  private appHeaders(jwt: string): HeadersInit {
    return {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "pi-relay",
    };
  }

  private async upsertConfig(config: GitHubAppConfig): Promise<void> {
    const now = new Date().toISOString();
    const value = JSON.stringify(config);
    const existing = this.db
      .select()
      .from(settings)
      .where(eq(settings.key, GITHUB_APP_CONFIG_KEY))
      .get();

    if (existing) {
      this.db
        .update(settings)
        .set({ value, updatedAt: now })
        .where(eq(settings.key, GITHUB_APP_CONFIG_KEY))
        .run();
      return;
    }

    this.db
      .insert(settings)
      .values({
        key: GITHUB_APP_CONFIG_KEY,
        value,
        updatedAt: now,
      })
      .run();
  }

  private validatePrivateKey(privateKey: string): void {
    try {
      const key = createPrivateKey(privateKey.trim());
      if (key.asymmetricKeyType !== "rsa") {
        throw new Error(
          `Expected RSA private key, got ${key.asymmetricKeyType ?? "unknown"}`,
        );
      }
    } catch (err) {
      throw new Error(
        `Invalid private key: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function normalizeInstallationIds(value: number[] | undefined): number[] {
  if (!value) return [];
  return [...new Set(value.filter((id) => Number.isInteger(id) && id > 0))];
}

async function buildGitHubError(response: Response): Promise<Error> {
  const text = await response.text();
  return new Error(`GitHub API error: ${response.status} ${text}`);
}
