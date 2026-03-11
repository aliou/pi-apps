import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  GithubLogoIcon,
  LockKeyIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TokenForm } from "../components/token-form";
import {
  api,
  type GitHubRepo,
  type GitHubRepoListResponse,
  type GitHubTokenInfo,
} from "../lib/api";
import { fuzzyFilterRepos } from "../lib/repo-search";
import { cn } from "../lib/utils";

interface GitHubAppStatus {
  configured: boolean;
  appId?: number;
  appName?: string;
  appSlug?: string;
  hasPrivateKey: boolean;
  hasWebhookSecret: boolean;
  installationIds: number[];
  preferredMode: "github_app" | "pat" | "none";
  patConfigured: boolean;
  error?: string;
}

interface GitHubAppInstallation {
  id: number;
  account: { login: string; type: "User" | "Organization" };
  repositorySelection: "all" | "selected";
  suspendedAt: string | null;
}

export default function GitHubSetupPage() {
  const [tokenInfo, setTokenInfo] = useState<GitHubTokenInfo | null>(null);
  const [appStatus, setAppStatus] = useState<GitHubAppStatus | null>(null);
  const [installations, setInstallations] = useState<GitHubAppInstallation[]>([]);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [repoMode, setRepoMode] = useState<"pat" | "github_app" | null>(null);
  const [loading, setLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(false);
  const [submittingPat, setSubmittingPat] = useState(false);
  const [submittingApp, setSubmittingApp] = useState(false);
  const [repoQuery, setRepoQuery] = useState("");
  const [appId, setAppId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [appError, setAppError] = useState<string | null>(null);

  const fetchTokenInfo = useCallback(async () => {
    const result = await api.get<GitHubTokenInfo>("/github/token");
    if (!result.error) {
      setTokenInfo(result.data);
    }
  }, []);

  const fetchAppStatus = useCallback(async () => {
    const result = await api.get<GitHubAppStatus>("/github/app/status");
    if (!result.error) {
      setAppStatus(result.data);
      if (result.data?.configured) {
        setAppId(String(result.data.appId ?? ""));
      }
    }
  }, []);

  const fetchInstallations = useCallback(async () => {
    const result = await api.get<GitHubAppInstallation[]>(
      "/github/app/installations",
    );
    if (!result.error && result.data) {
      setInstallations(result.data);
    } else {
      setInstallations([]);
    }
  }, []);

  const fetchRepos = useCallback(async () => {
    setReposLoading(true);
    const result = await api.get<GitHubRepoListResponse>("/github/repos");
    if (!result.error && result.data) {
      setRepos(result.data.repos);
      setRepoMode(result.data.mode);
    } else {
      setRepos([]);
      setRepoMode(null);
    }
    setReposLoading(false);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchTokenInfo(), fetchAppStatus()]);
    setLoading(false);
  }, [fetchAppStatus, fetchTokenInfo]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const appConfigured = appStatus?.configured;
    const patValid = tokenInfo?.configured && tokenInfo?.valid;
    if (appConfigured || patValid) {
      fetchRepos();
    }
    if (appConfigured) {
      fetchInstallations();
    }
  }, [appStatus, tokenInfo, fetchInstallations, fetchRepos]);

  const handleSubmitToken = async (
    token: string,
  ): Promise<{ success: boolean; error?: string }> => {
    setSubmittingPat(true);
    const result = await api.post<{ user: string; scopes: string[] }>(
      "/github/token",
      { token },
    );
    setSubmittingPat(false);

    if (result.error) {
      return { success: false, error: result.error };
    }

    await reload();
    return { success: true };
  };

  const handleRemoveToken = async () => {
    await api.delete("/github/token");
    setTokenInfo({ configured: false });
    await reload();
  };

  const handleConnectApp = async () => {
    setSubmittingApp(true);
    setAppError(null);
    const result = await api.post<{ ok: boolean }>("/github/app/connect", {
      appId: Number(appId),
      privateKey,
      webhookSecret: webhookSecret || undefined,
    });
    setSubmittingApp(false);

    if (result.error) {
      setAppError(result.error);
      return;
    }

    setPrivateKey("");
    setWebhookSecret("");
    await reload();
  };

  const handleDisconnectApp = async () => {
    await api.delete("/github/app/connect");
    setInstallations([]);
    await reload();
  };

  const filteredRepos = useMemo(
    () => fuzzyFilterRepos(repos, repoQuery),
    [repos, repoQuery],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <CircleNotchIcon className="size-7 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
          <GithubLogoIcon className="size-5" weight="bold" />
          GitHub
        </h2>
        <p className="mt-1 text-sm text-muted">
          Prefer GitHub App auth. Keep PAT as fallback for repos where the app is
          not installed yet.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">GitHub App</h3>
            <p className="mt-1 text-sm text-muted">
              {appStatus?.configured
                ? `Connected${appStatus.appName ? ` as ${appStatus.appName}` : ""}.`
                : "Recommended. Connect the app, then install it on your repos."}
            </p>
          </div>
          <StatusBadge
            ok={appStatus?.configured ?? false}
            label={
              appStatus?.preferredMode === "github_app"
                ? "Active"
                : appStatus?.configured
                  ? "Configured"
                  : "Not configured"
            }
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">App ID</span>
            <input
              type="number"
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs text-muted">Private key</span>
            <textarea
              value={privateKey}
              onChange={(event) => setPrivateKey(event.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----"
              rows={8}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs text-muted">
              Webhook secret (optional)
            </span>
            <input
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {appStatus?.error ? (
          <p className="mt-3 text-sm text-amber-500">{appStatus.error}</p>
        ) : null}
        {appError ? <p className="mt-3 text-sm text-status-err">{appError}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConnectApp}
            disabled={submittingApp || !appId.trim() || !privateKey.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {submittingApp ? "Saving..." : appStatus?.configured ? "Update app" : "Connect app"}
          </button>
          {appStatus?.configured ? (
            <button
              type="button"
              onClick={handleDisconnectApp}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <TrashIcon className="size-4" />
              Disconnect
            </button>
          ) : null}
          <a
            href="https://github.com/settings/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
          >
            <ArrowSquareOutIcon className="size-4" />
            Open GitHub App settings
          </a>
        </div>

        {installations.length > 0 ? (
          <div className="mt-5 rounded-lg border border-border bg-bg/60 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted/70">
              Installations
            </p>
            <div className="space-y-2">
              {installations.map((installation) => (
                <div
                  key={installation.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-fg">
                      {installation.account.login}
                    </p>
                    <p className="text-xs text-muted">
                      {installation.repositorySelection === "all"
                        ? "All repositories"
                        : "Selected repositories"}
                    </p>
                  </div>
                  {installation.suspendedAt ? (
                    <span className="text-xs text-status-err">Suspended</span>
                  ) : (
                    <span className="text-xs text-muted">#{installation.id}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">Personal Access Token</h3>
            <p className="mt-1 text-sm text-muted">
              Optional fallback for repos where the GitHub App is not installed.
            </p>
          </div>
          <StatusBadge
            ok={Boolean(tokenInfo?.configured && tokenInfo?.valid)}
            label={
              appStatus?.preferredMode === "pat"
                ? "Active"
                : tokenInfo?.configured
                  ? tokenInfo.valid
                    ? "Configured"
                    : "Invalid"
                  : "Not configured"
            }
          />
        </div>

        {tokenInfo?.configured ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-fg">
                  {tokenInfo.valid ? "PAT configured" : "PAT invalid"}
                </p>
                {tokenInfo.valid && tokenInfo.user ? (
                  <p className="mt-0.5 text-sm text-muted">
                    Authenticated as <span className="font-mono text-accent">{tokenInfo.user}</span>
                  </p>
                ) : null}
                {!tokenInfo.valid && tokenInfo.error ? (
                  <p className="mt-0.5 text-sm text-status-err">{tokenInfo.error}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={handleRemoveToken}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <TrashIcon className="size-4" />
                Remove
              </button>
            </div>

            {tokenInfo.valid && tokenInfo.scopes?.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Scopes</p>
                <div className="flex flex-wrap gap-1.5">
                  {tokenInfo.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-md bg-surface px-2 py-1 font-mono text-xs text-muted"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            <div>
              <h4 className="mb-3 text-sm font-semibold text-fg">
                Create a Personal Access Token
              </h4>
              <ol className="mb-5 list-inside list-decimal space-y-2 text-sm text-muted">
                <li>
                  Go to{" "}
                  <a
                    href="https://github.com/settings/tokens?type=beta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                  >
                    GitHub Token Settings
                  </a>
                </li>
                <li>Click “Generate new token” (fine-grained)</li>
                <li>Set expiration and select repositories</li>
                <li>
                  Grant permissions:
                  <span className="ml-1 font-mono text-xs text-accent">
                    contents:rw metadata:r
                  </span>
                </li>
              </ol>
            </div>
            <TokenForm onSubmit={handleSubmitToken} isLoading={submittingPat} />
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">Accessible repositories</h3>
            <p className="mt-1 text-sm text-muted">
              {repoMode
                ? `Currently resolved through ${repoMode === "github_app" ? "GitHub App" : "PAT"}.`
                : "Connect GitHub auth to load repositories."}
            </p>
          </div>
          <div className="w-full sm:w-80">
            <input
              type="text"
              value={repoQuery}
              onChange={(event) => setRepoQuery(event.target.value)}
              placeholder="Search repos (fuzzy)…"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus:border-accent"
            />
          </div>
        </div>

        {reposLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <CircleNotchIcon className="size-4 animate-spin" />
            Loading...
          </div>
        ) : repos.length === 0 ? (
          <p className="text-sm text-muted">No repositories found.</p>
        ) : filteredRepos.length === 0 ? (
          <p className="text-sm text-muted">No repositories match "{repoQuery}".</p>
        ) : (
          <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
            {filteredRepos.slice(0, 10).map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between bg-surface/50 px-4 py-3 transition-colors hover:bg-surface"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {repo.isPrivate ? (
                    <LockKeyIcon className="size-4 shrink-0 text-muted/50" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{repo.fullName}</p>
                    {repo.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted">{repo.description}</p>
                    ) : null}
                  </div>
                </div>
                <a
                  href={repo.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-muted/50 transition-colors hover:text-fg"
                >
                  <ArrowSquareOutIcon className="size-[18px]" />
                </a>
              </div>
            ))}
            {filteredRepos.length > 10 ? (
              <div className="bg-surface/30 px-4 py-2.5 text-xs text-muted">
                And {filteredRepos.length - 10} more
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/70 px-3 py-1.5 text-xs font-medium text-fg">
      {ok ? (
        <CheckCircleIcon className="size-4 text-status-ok" weight="fill" />
      ) : (
        <WarningCircleIcon className="size-4 text-status-err" weight="fill" />
      )}
      <span className={cn(ok ? "text-status-ok" : "text-muted")}>{label}</span>
    </div>
  );
}
